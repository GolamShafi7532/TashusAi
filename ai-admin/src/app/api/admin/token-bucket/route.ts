import { NextResponse } from 'next/server';
import { isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin' };
  }
  const token = req.headers
    .get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

/**
 * GET /api/admin/token-bucket
 * Proxies to backend /api/ai/token-bucket/status with auth check.
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3000';
    const res = await fetch(`${backendUrl}/api/ai/token-bucket/status`, { next: { revalidate: 5 } });

    if (!res.ok) {
      return NextResponse.json({ error: 'Backend error' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[AdminTokenBucketRoute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
