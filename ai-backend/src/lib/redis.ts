/**
 * Redis client singleton using ioredis.
 * Used for:
 *   - Tashus adapter response cache (namespace: tashus-cache:*)
 *   - BullMQ job queues (namespace: bull:*)
 *   - Session circuit-breaker pub/sub (channel: session:{id}:control)
 *   - Rate limiting token buckets (namespace: ratelimit:*)
 *
 * Source of truth: AI Chatbot blueprint.md §3.2 (caching) & §4.1 (pub/sub)
 */
import Redis from 'ioredis';
import { env } from '@/lib/env';

let _redis: Redis | null = null;
let _subscriber: Redis | null = null;

/**
 * Main Redis client — used for get/set/publish and BullMQ connection.
 * ioredis automatically reconnects on disconnect.
 */
export function getRedisClient(): Redis {
  if (_redis) return _redis;

  _redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times) {
      // Exponential backoff: 100ms, 200ms, 400ms … capped at 5s
      return Math.min(100 * 2 ** times, 5000);
    },
    reconnectOnError(err) {
      // Reconnect on ECONNRESET and ETIMEDOUT
      const targetErrors = ['ECONNRESET', 'ETIMEDOUT'];
      if (targetErrors.some((e) => err.message.includes(e))) return true;
      return false;
    },
  });

  _redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  _redis.on('connect', () => {
    if (env.NODE_ENV !== 'production') {
      console.log('[Redis] Connected');
    }
  });

  return _redis;
}

/**
 * Dedicated subscriber client for Redis pub/sub.
 * A client in subscribe mode cannot issue regular commands,
 * so we need a separate instance.
 * Used by the SSE handler (blueprint §4.1) to listen on
 * session:{id}:control channels for circuit-breaker signals.
 */
export function getRedisSubscriber(): Redis {
  if (_subscriber) return _subscriber;

  _subscriber = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times) {
      return Math.min(100 * 2 ** times, 5000);
    },
  });

  _subscriber.on('error', (err) => {
    console.error('[Redis Subscriber] Error:', err.message);
  });

  return _subscriber;
}

// ── Cache key builders ─────────────────────────────────────────────────────────

/** Namespaced cache key for Tashus adapter responses */
export function buildTashusCacheKey(
  template: string,
  params?: Record<string, string | number>
): string {
  const sortedParams = Object.entries(params ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `tashus-cache:${template}:${JSON.stringify(sortedParams)}`;
}

/** Rate limit key per visitor */
export function buildRateLimitKey(visitorId: string): string {
  return `ratelimit:${visitorId}`;
}

/** Circuit-breaker pub/sub channel name for a session */
export function buildSessionControlChannel(sessionId: string): string {
  return `session:${sessionId}:control`;
}

// ── TTL map for Tashus adapter cache (blueprint §3.2) ──────────────────────────

/** TTLs in seconds, tuned per endpoint volatility */
export const TASHUS_CACHE_TTL: Record<string, number> = {
  '/search/find-cars': 60,
  '/search/find-cars/:listingId': 90,
  '/reservation/block-dates-by-car/:carListingId': 60,
  '/voucher/get-common-vouchers': 120,
  '/v2/voucher/slug/:voucherSlug': 120,
  '/search/vehicle-delivery-price/:drivingDistanceInKm': 60,
};

export function getTtlSeconds(template: string): number {
  return TASHUS_CACHE_TTL[template] ?? 60;
}

// ── Convenience re-export ──────────────────────────────────────────────────────
export const redis = getRedisClient();
