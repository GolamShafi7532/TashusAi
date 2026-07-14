/**
 * Tashus Read-Only Adapter — Low-level HTTP client.
 *
 * NON-NEGOTIABLE RULES (blueprint §0):
 *  1. This file ONLY implements GET. No post/put/delete methods exist.
 *  2. ALLOWED_ENDPOINTS is the single source of truth for permitted calls.
 *  3. Any path not in the allow-list throws TashusAdapterViolationError.
 *  4. Every call (cache hit or miss) is logged to ai_tool_call_logs.
 *  5. Redis cache wraps every fetch to protect Tashus API from bursty load.
 *
 * Source of truth: AI Chatbot blueprint.md §3.2
 */
import { env } from '@/lib/env';
import { redis, buildTashusCacheKey, getTtlSeconds } from '@/lib/redis';
import { db } from '@/db/client';

// ── Custom error classes ───────────────────────────────────────────────────────

export class TashusAdapterViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TashusAdapterViolationError';
  }
}

export class TashusUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(`Tashus API returned ${status}: ${message}`);
    this.name = 'TashusUpstreamError';
  }
}

// ── Allow-list (blueprint §3.2) ────────────────────────────────────────────────
// This Set is the ONLY place new Tashus endpoints are authorized.
// Any new entry requires an explicit code review / PR.

const ALLOWED_ENDPOINTS = new Set([
  '/search/find-cars',
  '/search/find-cars/:listingId',
  '/reservation/block-dates-by-car/:carListingId',
  '/voucher/get-common-vouchers',
  '/v2/voucher/slug/:voucherSlug',
  '/search/vehicle-delivery-price/:drivingDistanceInKm',
]);

// ── Path → template normaliser ────────────────────────────────────────────────
// Converts "/search/find-cars/142" → "/search/find-cars/:listingId"
// so allow-list lookups work on concrete paths.

const TEMPLATE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/search\/find-cars\/\d+$/, '/search/find-cars/:listingId'],
  [/^\/reservation\/block-dates-by-car\/\d+$/, '/reservation/block-dates-by-car/:carListingId'],
  [/^\/v2\/voucher\/slug\/[^/]+$/, '/v2/voucher/slug/:voucherSlug'],
  [/^\/search\/vehicle-delivery-price\/[\d.]+$/, '/search/vehicle-delivery-price/:drivingDistanceInKm'],
];

function toTemplate(path: string): string {
  for (const [pattern, template] of TEMPLATE_PATTERNS) {
    if (pattern.test(path)) return template;
  }
  return path; // exact match (e.g. /search/find-cars, /voucher/get-common-vouchers)
}

// ── Audit logger ──────────────────────────────────────────────────────────────

interface LogToolCallParams {
  sessionId?: string | null;
  toolName: string;
  endpoint: string;
  requestParams?: Record<string, unknown>;
  responseStatus?: number;
  responseSummary?: Record<string, unknown>;
  cacheHit: boolean;
  durationMs?: number;
}

async function logToolCall(params: LogToolCallParams): Promise<void> {
  // Output structured log line to console for log aggregators (OBS-02)
  console.log(JSON.stringify({
    level: 'INFO',
    type: 'tool_call',
    session_id: params.sessionId ?? null,
    tool_name: params.toolName,
    latency_ms: params.durationMs ?? 0,
    status: params.responseStatus ?? null,
    cache_hit: params.cacheHit
  }));

  try {
    await db.from('ai_tool_call_logs').insert({
      session_id: params.sessionId ?? null,
      tool_name: params.toolName,
      http_method: 'GET', // DB CHECK constraint enforces this — compile-time safety
      endpoint: params.endpoint,
      request_params: params.requestParams ?? null,
      response_status: params.responseStatus ?? null,
      response_summary: params.responseSummary ?? null,
      cache_hit: params.cacheHit,
      duration_ms: params.durationMs ?? null,
    } as any);
  } catch (err) {
    // Audit log failure must never crash the main request
    console.error('[TashusAdapter] Failed to write tool call log:', err);
  }
}

// ── Core GET function ─────────────────────────────────────────────────────────

export interface TashusGetOptions {
  /** Optional session_id to associate this tool call with in ai_tool_call_logs */
  sessionId?: string | null;
  /** The logical tool name (e.g. 'search_vehicles') for audit log */
  toolName?: string;
  /** Query string params appended to the URL */
  params?: Record<string, string | number>;
}

export async function tashusGet<T>(
  path: string,
  options: TashusGetOptions = {}
): Promise<T> {
  const template = toTemplate(path);

  // ── 1. Allow-list enforcement (hard fail-closed) ───────────────────────────
  if (!ALLOWED_ENDPOINTS.has(template)) {
    const msg = `[TashusAdapter] Blocked non-allow-listed endpoint: ${path} (template: ${template})`;
    console.error(msg);
    throw new TashusAdapterViolationError(msg);
  }

  const { sessionId, toolName = 'unknown', params } = options;

  // ── 2. Redis cache check ───────────────────────────────────────────────────
  const cacheKey = buildTashusCacheKey(template, params);
  const start = Date.now();

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const durationMs = Date.now() - start;
      await logToolCall({
        sessionId,
        toolName,
        endpoint: template,
        requestParams: params as Record<string, unknown>,
        responseStatus: 200,
        cacheHit: true,
        durationMs,
      });
      return JSON.parse(cached) as T;
    }
  } catch (cacheErr) {
    // Cache read failure → fall through to live fetch
    console.warn('[TashusAdapter] Redis cache read failed, falling through:', cacheErr);
  }

  // ── 3. Build URL ───────────────────────────────────────────────────────────
  // NOTE: We concatenate manually instead of using new URL(path, base) because
  // new URL() treats the base path as the origin and DROPS any existing path
  // on the base URL. e.g. new URL('/search/find-cars', 'https://example.com/api')
  // produces 'https://example.com/search/find-cars' — losing the '/api' segment.
  const baseUrl = env.TASHUS_API_BASE_URL.replace(/\/$/, '');
  const fullPath = `${baseUrl}${path}`;
  const url = new URL(fullPath);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  console.log(`[TashusAdapter] → GET ${url.toString()}`);
  // ── 4. Fetch from Tashus (GET only — no other method available) ────────────
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET', // literal constant — this function has no other method
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000), // 20s — dev API can be slow
    });
  } catch (fetchErr: unknown) {
    const durationMs = Date.now() - start;
    await logToolCall({
      sessionId,
      toolName,
      endpoint: template,
      requestParams: params as Record<string, unknown>,
      responseStatus: 0,
      cacheHit: false,
      durationMs,
    });
    throw new TashusUpstreamError(
      0,
      fetchErr instanceof Error ? fetchErr.message : 'Network error'
    );
  }

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[TashusAdapter] ✗ ${res.status} from ${url.toString()}`);
    console.error(`[TashusAdapter] Response body: ${body.slice(0, 500)}`);
    await logToolCall({
      sessionId,
      toolName,
      endpoint: template,
      requestParams: params as Record<string, unknown>,
      responseStatus: res.status,
      cacheHit: false,
      durationMs,
    });
    throw new TashusUpstreamError(res.status, body);
  }

  const data = (await res.json()) as T;

  // ── 5. Populate cache ──────────────────────────────────────────────────────
  const ttl = getTtlSeconds(template);
  try {
    await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
  } catch (cacheWriteErr) {
    console.warn('[TashusAdapter] Redis cache write failed:', cacheWriteErr);
  }

  // ── 6. Log successful live fetch ───────────────────────────────────────────
  await logToolCall({
    sessionId,
    toolName,
    endpoint: template,
    requestParams: params as Record<string, unknown>,
    responseStatus: res.status,
    responseSummary: { cached: false, ttlSeconds: ttl },
    cacheHit: false,
    durationMs,
  });

  return data;
}
