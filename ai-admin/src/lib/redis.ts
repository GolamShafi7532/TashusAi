import Redis from 'ioredis';
import { env } from './env';

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (_redis) return _redis;

  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required in admin environment');
  }

  _redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  _redis.on('error', (err) => {
    console.error('[Admin Redis] Error:', err.message);
  });

  return _redis;
}

export function buildSessionControlChannel(sessionId: string): string {
  return `session:${sessionId}:control`;
}

