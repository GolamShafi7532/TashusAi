import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Resolve admin — bypass auth in local dev mode */
async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin' };
  }
  const token = req.headers.get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

/**
 * GET /api/admin/audit/tool-calls
 * Retrieves read-only tool execution logs for compliance monitoring.
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: logs, error } = await (db
      .from('ai_tool_call_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[AuditRoute] DB Error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve audit logs' }, { status: 500 });
    }

    return NextResponse.json({ logs: logs ?? [] });
  } catch (err: any) {
    console.error('[AuditRoute] GET Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
