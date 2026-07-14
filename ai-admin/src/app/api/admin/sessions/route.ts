import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Resolve admin from cookie, or return a synthetic dev admin in local mode */
async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  const token = req.headers.get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

/**
 * GET /api/admin/sessions
 * List and filter chat sessions.
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const channel = url.searchParams.get('channel');
    const assignedAdminId = url.searchParams.get('assignedAdminId');

    let query = (db.from('ai_chat_sessions') as any)
      .select('*')
      .order('last_message_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (channel) query = query.eq('channel', channel);
    if (assignedAdminId) {
      query = assignedAdminId === 'null'
        ? query.is('assigned_admin_id', null)
        : query.eq('assigned_admin_id', assignedAdminId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('[SessionsListRoute] DB Error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve sessions' }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (err: any) {
    console.error('[SessionsListRoute] Error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/sessions
 * Create a test chat session (dev / testing utility).
 */
export async function POST(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const visitorId = body.visitor_id ?? `test-visitor-${Date.now()}`;
    const channel = body.channel ?? 'widget';

    const { data: session, error } = await (db.from('ai_chat_sessions') as any)
      .insert({
        visitor_id: visitorId,
        channel,
        status: 'active',
        is_ai_paused: false,
        locale: 'en-AU',
        metadata: {},
        started_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch (err: any) {
    console.error('[SessionsCreateRoute] Error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
