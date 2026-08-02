import { NextResponse } from 'next/server';
import { resolveAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/token-bucket
 * Proxies to ai-backend /api/ai/token-bucket/status.
 *
 * Uses AI_BACKEND_URL (server-side) not NEXT_PUBLIC_AI_BACKEND_URL —
 * NEXT_PUBLIC_ vars are only available in the browser bundle, not in
 * server-side route handlers.
 */
export async function GET(req: Request) {
  try {
    // Auth check — dev mode returns a dev admin, production requires JWT
    let admin;
    try {
      admin = await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Server-side env var — falls back to localhost:3001 for local dev
    const backendUrl =
      process.env.AI_BACKEND_URL ||
      process.env.NEXT_PUBLIC_AI_BACKEND_URL ||
      'http://localhost:3001';

    const res = await fetch(`${backendUrl}/api/ai/token-bucket/status`, {
      // Short cache — token bucket changes frequently
      next: { revalidate: 5 },
    });

    if (!res.ok) {
      console.error(`[AdminTokenBucketRoute] Backend returned ${res.status}`);
      return NextResponse.json({ error: 'Backend error' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[AdminTokenBucketRoute] Fetch failed:', err?.message ?? err);
    // Return a safe empty response instead of 500 so the UI doesn't crash —
    // token bucket status is non-critical UI info
    return NextResponse.json({
      keys: [],
      totalKeys: 0,
      activeKeys: 0,
      error: 'Could not reach backend',
    });
  }
}
