/**
 * GET /api/ai/health
 *
 * Liveness + readiness probe. Checks:
 *   1. Supabase DB connection
 *   2. Redis connection
 *   3. Tashus API reachability (via adapter cache key ping)
 *
 * Returns HTTP 200 when all healthy, 503 when any dependency is down.
 * Safe to call without authentication.
 *
 * Source of truth: AI Chatbot blueprint.md §7 (API route map)
 */
import { NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';
import { redis } from '@/lib/redis';
import { env } from '@/lib/env';

interface ServiceStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    tashusApi: ServiceStatus;
  };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkTashusApi(),
  ]);

  const [dbResult, redisResult, tashusResult] = checks;

  const database = dbResult.status === 'fulfilled' ? dbResult.value : { status: 'error' as const, detail: String((dbResult as PromiseRejectedResult).reason) };
  const redisStatus = redisResult.status === 'fulfilled' ? redisResult.value : { status: 'error' as const, detail: String((redisResult as PromiseRejectedResult).reason) };
  const tashusApi = tashusResult.status === 'fulfilled' ? tashusResult.value : { status: 'error' as const, detail: String((tashusResult as PromiseRejectedResult).reason) };

  const allOk =
    database.status === 'ok' &&
    redisStatus.status === 'ok' &&
    tashusApi.status === 'ok';

  const body: HealthResponse = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    services: {
      database,
      redis: redisStatus,
      tashusApi,
    },
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}

// ── Individual checks ──────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await db.from('ai_agent_configs').select('id').limit(1).single();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - start, detail: 'DB query failed' };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Date.now() - start;
    if (pong !== 'PONG') {
      return { status: 'error', latencyMs, detail: 'Unexpected PING response' };
    }
    return { status: 'ok', latencyMs };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'Redis unreachable',
    };
  }
}

async function checkTashusApi(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    // Lightweight HEAD-like check — just verify the base URL is reachable.
    // We don't call an actual endpoint to avoid polluting ai_tool_call_logs
    // with health-check noise.
    const res = await fetch(`${env.TASHUS_API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    }).catch(() =>
      // Tashus may not expose /health — treat any response (even 404) as reachable
      fetch(env.TASHUS_API_BASE_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
    );
    const latencyMs = Date.now() - start;
    // Any HTTP response (even 4xx) means the host is reachable
    return { status: 'ok', latencyMs, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'Tashus API unreachable',
    };
  }
}
