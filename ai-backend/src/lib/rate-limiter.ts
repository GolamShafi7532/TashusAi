import { redis } from './redis';

export interface RateLimitResult {
  limited: boolean;
  retryAfter?: number; // seconds to wait (only returned for the minute limit)
}

/**
 * atomic rate limiting using Redis increment operations.
 * Limits:
 *   - Max 20 requests per minute
 *   - Max 100 requests per day (24 hours)
 */
export async function isRateLimited(visitorId: string): Promise<RateLimitResult> {
  const minKey = `ratelimit:${visitorId}:minute`;
  const dayKey = `ratelimit:${visitorId}:day`;

  // 1. Minute Limit (20 req/min)
  const minCount = await redis.incr(minKey);
  if (minCount === 1) {
    await redis.expire(minKey, 60);
  } else if (minCount > 20) {
    const ttl = await redis.ttl(minKey);
    return {
      limited: true,
      retryAfter: ttl > 0 ? ttl : 60,
    };
  }

  // 2. Daily Limit (100 req/day)
  const dayCount = await redis.incr(dayKey);
  if (dayCount === 1) {
    await redis.expire(dayKey, 86400); // 24 hours
  } else if (dayCount > 100) {
    return {
      limited: true,
    };
  }

  return { limited: false };
}
