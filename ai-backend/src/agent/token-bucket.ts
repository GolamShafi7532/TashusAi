/**
 * Token Bucket Manager (v3.1.0)
 *
 * Manages a pool of Groq API keys with smart cooldown rotation.
 * When a key hits a rate-limit (429) or other retryable error, it is put
 * into a cooldown period and removed from the active rotation. Other keys
 * continue to serve requests. Once a key's cooldown expires it is
 * automatically re-admitted to the pool.
 *
 * All state is stored in Redis so it survives server restarts and is shared
 * across multiple Next.js serverless instances.
 *
 * Redis keys:
 *   token-bucket:cooldown:{maskedKey}  → TTL-based key; exists = in cooldown
 *   token-bucket:failures:{maskedKey} → INCR counter of consecutive failures
 *   token-bucket:last-used-index      → round-robin cursor
 *   token-bucket:success:{maskedKey}  → total success count
 */

import { redis } from '@/lib/redis';
import { env } from '@/lib/env';

// ── Config ─────────────────────────────────────────────────────────────────────

/** How long a key stays in cooldown after hitting rate-limit (default 65s > Groq 60s window) */
const COOLDOWN_429_SECS = 65;
/** How long a key stays in cooldown after a server error (5xx) */
const COOLDOWN_5XX_SECS = 30;
/** How long a key stays in cooldown after a timeout */
const COOLDOWN_TIMEOUT_SECS = 15;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KeyStatus {
  index: number;           // 1-based position in GROK_API_KEYS
  masked: string;          // last 6 chars visible: "...abc123"
  available: boolean;
  cooldownSeconds: number; // 0 = available, >0 = seconds remaining in cooldown
  cooldownReason: string | null;
  successCount: number;
  failureCount: number;
}

export interface BucketStatus {
  keys: KeyStatus[];
  availableCount: number;
  totalKeys: number;
  allCoolingDown: boolean;
  nextAvailableIn: number;  // seconds until first key cools down (0 = some available now)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key || key.length < 6) return '***';
  return `...${key.slice(-6)}`;
}

function cooldownKey(masked: string): string {
  return `token-bucket:cooldown:${masked}`;
}
function failureKey(masked: string): string {
  return `token-bucket:failures:${masked}`;
}
function successKey(masked: string): string {
  return `token-bucket:success:${masked}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get all configured Groq keys (parsed from GROK_API_KEYS env).
 */
export function getAllKeys(): string[] {
  return (env.GROK_API_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
}

/**
 * Get the next available key using round-robin, skipping keys in cooldown.
 * Returns null if ALL keys are in cooldown.
 */
export async function getNextAvailableKey(): Promise<{ key: string; index: number; masked: string } | null> {
  const keys = getAllKeys();
  if (keys.length === 0) return null;

  // Try each key starting from the last-used position
  let cursorStr = await redis.get('token-bucket:last-used-index').catch(() => null);
  let cursor = cursorStr ? parseInt(cursorStr, 10) : 0;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (cursor + attempt) % keys.length;
    const key = keys[idx];
    const masked = maskKey(key);
    const inCooldown = await redis.exists(cooldownKey(masked)).catch(() => 0);

    if (!inCooldown) {
      // Save cursor for next call (round-robin advance)
      await redis.set('token-bucket:last-used-index', String((idx + 1) % keys.length), 'EX', 3600).catch(() => {});
      return { key, index: idx + 1, masked };
    }
  }

  return null; // all cooling down
}

/**
 * Mark a key as entering cooldown after an error.
 * Calculates cooldown duration based on error type.
 */
export async function markKeyCooldown(
  keyOrMasked: string,
  errorType: '429' | '5xx' | 'timeout' | 'empty',
  errorMsg?: string
): Promise<void> {
  // Accept either a full key or already-masked string
  const masked = keyOrMasked.startsWith('...') ? keyOrMasked : maskKey(keyOrMasked);

  const ttl =
    errorType === '429'     ? COOLDOWN_429_SECS :
    errorType === '5xx'     ? COOLDOWN_5XX_SECS :
    errorType === 'timeout' ? COOLDOWN_TIMEOUT_SECS : 30;

  await Promise.all([
    redis.setex(cooldownKey(masked), ttl, errorType + (errorMsg ? `:${errorMsg.slice(0, 100)}` : '')).catch(() => {}),
    redis.incr(failureKey(masked)).catch(() => {}),
  ]);

  console.log(`[TokenBucket] 🔴 Key ${masked} in cooldown for ${ttl}s (${errorType})`);
}

/**
 * Mark a key as having succeeded. Resets failure count.
 */
export async function markKeySuccess(keyOrMasked: string): Promise<void> {
  const masked = keyOrMasked.startsWith('...') ? keyOrMasked : maskKey(keyOrMasked);
  await Promise.all([
    redis.del(cooldownKey(masked)).catch(() => {}),
    redis.set(failureKey(masked), '0').catch(() => {}),
    redis.incr(successKey(masked)).catch(() => {}),
  ]);
}

/**
 * Get full status of all keys in the bucket.
 * Used by the admin dashboard and header alert.
 */
export async function getBucketStatus(): Promise<BucketStatus> {
  const keys = getAllKeys();

  const statuses: KeyStatus[] = await Promise.all(
    keys.map(async (key, idx): Promise<KeyStatus> => {
      const masked = maskKey(key);
      const [cooldownVal, failures, successes] = await Promise.all([
        redis.get(cooldownKey(masked)).catch(() => null),
        redis.get(failureKey(masked)).catch(() => null),
        redis.get(successKey(masked)).catch(() => null),
      ]);

      let cooldownSeconds = 0;
      let cooldownReason: string | null = null;

      if (cooldownVal !== null) {
        // Get TTL for remaining seconds
        const ttl = await redis.ttl(cooldownKey(masked)).catch(() => 0);
        cooldownSeconds = Math.max(0, ttl);
        cooldownReason = cooldownVal.split(':')[0]; // e.g. "429" or "5xx"
      }

      return {
        index:          idx + 1,
        masked,
        available:      cooldownSeconds === 0,
        cooldownSeconds,
        cooldownReason,
        successCount:   parseInt(successes ?? '0', 10),
        failureCount:   parseInt(failures  ?? '0', 10),
      };
    })
  );

  const availableCount = statuses.filter((s) => s.available).length;
  const allCoolingDown = availableCount === 0 && keys.length > 0;

  // Time until first key becomes available
  const nextAvailableIn = allCoolingDown
    ? Math.min(...statuses.filter((s) => !s.available).map((s) => s.cooldownSeconds))
    : 0;

  return {
    keys: statuses,
    availableCount,
    totalKeys: keys.length,
    allCoolingDown,
    nextAvailableIn,
  };
}
