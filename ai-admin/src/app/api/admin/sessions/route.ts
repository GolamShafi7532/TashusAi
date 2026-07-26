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
 * List and filter chat sessions with stats.
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
    const handoff = url.searchParams.get('handoff') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');

    let query = (db.from('ai_chat_sessions') as any)
      .select('*')
      .order('is_ai_paused', { ascending: false }) // Handoffs float to top
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (handoff) {
      query = query.eq('is_ai_paused', true);
    }
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

    // Calculate stats
    const allSessionsQuery = await (db.from('ai_chat_sessions') as any)
      .select('status, is_ai_paused, closed_at');
    
    const allSessions = allSessionsQuery.data || [];
    const stats = {
      active: allSessions.filter((s: any) => s.status === 'active' && !s.is_ai_paused).length,
      handed_off: allSessions.filter((s: any) => s.is_ai_paused).length,
      closed_today: allSessions.filter((s: any) => {
        if (!s.closed_at) return false;
        const closedDate = new Date(s.closed_at);
        const today = new Date();
        return closedDate.toDateString() === today.toDateString();
      }).length,
    };

    // Enrich sessions with last message preview and admin names
    const enrichedSessions = await Promise.all((sessions || []).map(async (session: any) => {
      // Get last message
      const { data: lastMsg } = await (db.from('ai_chat_messages') as any)
        .select('content')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      // Get message count
      const { count } = await (db.from('ai_chat_messages') as any)
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id);

      // Get admin name if assigned
      let adminName = null;
      if (session.assigned_admin_id) {
        const { data: adminUser } = await (db.from('ai_admin_users') as any)
          .select('display_name')
          .eq('id', session.assigned_admin_id)
          .single();
        adminName = adminUser?.display_name;
      }

      return {
        ...session,
        last_message: lastMsg?.content || '',
        message_count: count || 0,
        admin_name: adminName,
      };
    }));

    return NextResponse.json({ 
      sessions: enrichedSessions,
      stats,
      pagination: { 
        total: enrichedSessions.length, 
        page: 1, 
        limit, 
        total_pages: 1 
      }
    });
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
