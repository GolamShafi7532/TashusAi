/**
 * Redis client singleton using ioredis.
 *
 * Used for:
 *   - Tashus adapter response cache (namespace: tashus-cache:*)
 *   - BullMQ job queues (namespace: bull:*)
 *   - Session circuit-breaker pub/sub (channel: session:{id}:control)
 *   - Rate limiting token buckets (namespace: ratelimit:*)
 *
 * ── Deployment notes ──────────────────────────────────────────────────────
 * Vercel (serverless):
 *   - Each function invocation gets a fresh Node.js process — connections are
 *     reused within a single cold-start but NOT across invocations.
 *   - maxRetriesPerRequest must be a number (not null) so ioredis doesn't hang
 *     a Vercel function waiting for an unreachable Redis.
 *   - Upstash requires TLS: use rediss:// (double-s) in REDIS_URL.
 *
 * Koyeb worker (long-running process):
 *   - BullMQ requires maxRetriesPerRequest: null — set automatically when
 *     WORKER_PROCESS=true env var is present (set in Dockerfile.worker CMD).
 *
 * Source of truth: AI Chatbot blueprint.md §3.2 (caching) & §4.1 (pub/sub)
 */
import Redis from 'ioredis';
import { env } from '@/lib/env';

/** True when running inside the dedicated BullMQ worker process on Koyeb. */
const IS_WORKER = process.env.WORKER_PROCESS === 'true';

// ── Global singleton registry ──────────────────────────────────────────────
// Vercel reuses the same Node.js process across warm invocations on the same
// instance. Pinning the client to `globalThis` ensures the TCP connection (or
// HTTP keep-alive for Upstash) survives across hot-function calls without
// being garbage-collected or re-created on every request.
const g = globalThis as unknown as {
  _tashusRedis: Redis | undefined;
  _tashusRedisSubscriber: Redis | undefined;
};

/**
 * Main Redis client — used for get/set/publish and BullMQ connection.
 *
 * maxRetriesPerRequest behaviour:
 *   - Worker (BullMQ): null  — BullMQ requirement; lets it retry indefinitely
 *   - Serverless (Vercel): 1 — fail fast so the function doesn't hang
 */
export function getRedisClient(): Redis {
  if (g._tashusRedis) return g._tashusRedis;

  const client = new Redis(env.REDIS_URL, {
    // BullMQ requires null; serverless needs a number to avoid hanging functions
    maxRetriesPerRequest: IS_WORKER ? null : 1,
    enableReadyCheck: false,
    // Lazy-connect in serverless — don't block module init waiting for TCP
    lazyConnect: IS_WORKER ? false : true,
    retryStrategy(times) {
      if (!IS_WORKER && times > 2) return null; // give up fast in serverless
      return Math.min(100 * 2 ** times, 5000);
    },
    reconnectOnError(err) {
      const targetErrors = ['ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
    // Upstash requires TLS — tolerate self-signed certs in local dev
    tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  });

  client.on('error', (err) => {
    if (env.NODE_ENV === 'development' && err.message.includes('ECONNREFUSED')) return;
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    if (env.NODE_ENV !== 'production') {
      console.log('[Redis] Connected');
    }
  });

  g._tashusRedis = client;
  return client;
}

/**
 * Dedicated subscriber client for Redis pub/sub.
 * A client in subscribe mode cannot issue regular commands.
 * Used by the SSE handler (blueprint §4.1) to listen on session:{id}:control.
 */
export function getRedisSubscriber(): Redis {
  if (g._tashusRedisSubscriber) return g._tashusRedisSubscriber;

  const sub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: IS_WORKER ? null : 1,
    enableReadyCheck: false,
    lazyConnect: IS_WORKER ? false : true,
    retryStrategy(times) {
      if (!IS_WORKER && times > 2) return null;
      return Math.min(100 * 2 ** times, 5000);
    },
    tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  });

  sub.on('error', (err) => {
    if (env.NODE_ENV === 'development' && err.message.includes('ECONNREFUSED')) return;
    console.error('[Redis Subscriber] Error:', err.message);
  });

  g._tashusRedisSubscriber = sub;
  return sub;
}

// ── Cache key builders ──────────────────────────────────────────────────────

export function buildTashusCacheKey(
  template: string,
  params?: Record<string, string | number>
): string {
  const sortedParams = Object.entries(params ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `tashus-cache:${template}:${JSON.stringify(sortedParams)}`;
}

export function buildRateLimitKey(visitorId: string): string {
  return `ratelimit:${visitorId}`;
}

export function buildSessionControlChannel(sessionId: string): string {
  return `session:${sessionId}:control`;
}

// ── TTL map for Tashus adapter cache (blueprint §3.2) ──────────────────────

export const TASHUS_CACHE_TTL: Record<string, number> = {
  '/search/find-cars': 60,
  '/search/find-cars/:listingId': 90,
  '/reservation/block-dates-by-car/:carListingId': 60,
  '/voucher/get-common-vouchers': 120,
  '/v2/voucher/slug/:voucherSlug': 120,
  '/search/vehicle-delivery-price/:drivingDistanceInKm': 60,
};

const DEV_MULTIPLIER = process.env.NODE_ENV === 'development' ? (Number(process.env.DEV_CACHE_MULTIPLIER) || 5) : 1;

export function getTtlSeconds(template: string): number {
  const baseTtl = TASHUS_CACHE_TTL[template] ?? 60;
  return baseTtl * DEV_MULTIPLIER;
}

// ── Convenience re-export ───────────────────────────────────────────────────
// Eager singleton — safe because lazyConnect:true means no TCP connection is
// made at import time in serverless. The connection only opens on first command.
export const redis = getRedisClient();
