/**
 * Metrics collector (v3.1.0 — Phase E.1)
 *
 * Stores lightweight operational metrics in Redis so they survive across
 * serverless function invocations and can be queried by the admin dashboard.
 *
 * All writes are fire-and-forget (non-blocking) — a metric failure never
 * crashes the main request path.
 *
 * Namespaces:
 *   metrics:counters            HASH  — running totals (requests-success, etc.)
 *   metrics:tokens:{YYYY-MM-DD} HASH  — daily token usage by provider
 *   metrics:costs:{YYYY-MM-DD}  HASH  — daily cost in USD by provider
 *   metrics:latency:{op}        ZSET  — recent latency samples for percentiles
 *   metrics:events:{category}   LIST  — recent structured events (errors, alerts, hallucinations)
 */
import { redis } from './redis';
import { logger } from './logger';

// ── Cost table (USD per token) ─────────────────────────────────────────────────
const COST_PER_TOKEN: Record<string, { prompt: number; completion: number }> = {
  groq:       { prompt: 0.59  / 1_000_000, completion: 0.79  / 1_000_000 },
  openrouter: { prompt: 0.88  / 1_000_000, completion: 0.88  / 1_000_000 },
  anthropic:  { prompt: 3.00  / 1_000_000, completion: 15.00 / 1_000_000 },
};

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeRun(fn: () => Promise<void>): void {
  fn().catch((err) => logger.warn('Metrics write failed (non-critical)', { error: String(err) }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const metrics = {

  /**
   * Increment a named counter (e.g. 'requests-success', 'requests-failed',
   * 'tool-validation-errors', 'hallucination-events').
   */
  increment(counter: string, by: number = 1): void {
    safeRun(() => redis.hincrby('metrics:counters', counter, by).then(() => {}));
  },

  /**
   * Record prompt + completion token usage for a provider.
   * Also calculates and stores the approximate USD cost.
   */
  recordTokenUsage(provider: string, promptTokens: number, completionTokens: number): void {
    safeRun(async () => {
      const day = todayKey();
      await Promise.all([
        redis.hincrby(`metrics:tokens:${day}`, `${provider}:prompt`,     promptTokens),
        redis.hincrby(`metrics:tokens:${day}`, `${provider}:completion`, completionTokens),
        redis.expire(`metrics:tokens:${day}`, 90 * 86400), // keep 90 days
      ]);

      const costs = COST_PER_TOKEN[provider];
      if (costs) {
        const usd = promptTokens * costs.prompt + completionTokens * costs.completion;
        await redis.hincrbyfloat(`metrics:costs:${day}`, provider, usd);
        await redis.expire(`metrics:costs:${day}`, 90 * 86400);
      }
    });
  },

  /**
   * Record a latency sample for percentile calculation.
   * Keeps the last 1,000 samples per operation (ZSET trimmed on write).
   */
  recordLatency(operation: string, ms: number): void {
    safeRun(async () => {
      const key   = `metrics:latency:${operation}`;
      const score = Date.now();
      await redis.zadd(key, score, `${score}:${ms}`);
      await redis.zremrangebyrank(key, 0, -1001); // keep latest 1000
      await redis.expire(key, 3600);              // 1-hour sliding window
    });
  },

  /**
   * Log a structured event (error, hallucination warning, circuit-breaker trip).
   * Keeps the last 500 events per category.
   */
  logEvent(category: string, event: string, metadata?: Record<string, unknown>): void {
    safeRun(async () => {
      const entry = JSON.stringify({ ts: Date.now(), event, ...metadata });
      const key   = `metrics:events:${category}`;
      await redis.lpush(key, entry);
      await redis.ltrim(key, 0, 499);
      await redis.expire(key, 7 * 86400); // 7-day retention
    });
  },

  /**
   * Retrieve aggregated metrics for a date range (used by admin dashboard).
   */
  async getStats(fromDate: string, toDate: string): Promise<{
    totalTokens:      { prompt: number; completion: number };
    totalCostUsd:     number;
    providerBreakdown: Record<string, number>;
    requestCounts:    Record<string, number>;
  }> {
    // Build date list
    const dates: string[] = [];
    const cursor = new Date(fromDate);
    const end    = new Date(toDate);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }

    let promptTotal = 0, completionTotal = 0, totalCostUsd = 0;
    const providerBreakdown: Record<string, number> = {};

    for (const day of dates) {
      const [tokens, costs] = await Promise.all([
        redis.hgetall(`metrics:tokens:${day}`).catch(() => null),
        redis.hgetall(`metrics:costs:${day}`).catch(() => null),
      ]);

      for (const [key, val] of Object.entries(tokens ?? {})) {
        const n = parseInt(val, 10) || 0;
        if (key.endsWith(':prompt'))     promptTotal     += n;
        if (key.endsWith(':completion')) completionTotal += n;
      }

      for (const [provider, cost] of Object.entries(costs ?? {})) {
        const c = parseFloat(cost) || 0;
        totalCostUsd             += c;
        providerBreakdown[provider] = (providerBreakdown[provider] ?? 0) + c;
      }
    }

    const requestCounts = (await redis.hgetall('metrics:counters').catch(() => null)) ?? {};

    return {
      totalTokens:      { prompt: promptTotal, completion: completionTotal },
      totalCostUsd:     Math.round(totalCostUsd * 10000) / 10000,
      providerBreakdown,
      requestCounts:    Object.fromEntries(
        Object.entries(requestCounts).map(([k, v]) => [k, parseInt(v, 10) || 0])
      ),
    };
  },
};
