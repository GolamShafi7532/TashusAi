/**
 * GET /api/admin/sessions
 * 
 * Lists all chat sessions with filtering, pagination, and stats.
 * Used by admin dashboard to display session list.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const channel = searchParams.get('channel') || undefined;
    const handoff = searchParams.get('handoff') === 'true' ? true : undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query conditions
    let query = (db.from('ai_chat_sessions') as any).select(`
      id, visitor_id, tashus_user_id, status, is_ai_paused, channel,
      assigned_admin_id, started_at, last_message_at, closed_at, metadata
    `, { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (channel) {
      query = query.eq('channel', channel);
    }
    if (handoff) {
      query = query.eq('is_ai_paused', true);
    }

    // Sort: handoffs first, then by last_message_at
    query = query.order('is_ai_paused', { ascending: false });
    query = query.order('last_message_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data: sessions, count, error } = await query;

    if (error) {
      console.error('[Admin API] Failed to fetch sessions:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        sessions: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
        stats: { active: 0, active_ai: 0, handed_off: 0, closed: 0 },
      });
    }

    const sessionIds = sessions.map((s: any) => s.id);
    const sessionMap = new Map<string, any>(sessions.map((s: any) => [s.id, { ...s, message_count: 0 }]));

    // Get unread counts
    const { data: messages } = await (db.from('ai_chat_messages') as any)
      .select('session_id')
      .in('session_id', sessionIds) as any;

    const messageCounts = new Map<string, number>();
    (messages || []).forEach((m: any) => {
      messageCounts.set(m.session_id, (messageCounts.get(m.session_id) || 0) + 1);
    });

    messageCounts.forEach((count, sessionId) => {
      const session = sessionMap.get(sessionId);
      if (session) session.message_count = count;
    });

    // Get admin info for assigned sessions
    const adminIds = [...new Set((sessions || []).map((s: any) => s.assigned_admin_id).filter(Boolean))];
    if (adminIds.length > 0) {
      const { data: admins } = await (db.from('ai_admin_users') as any)
        .select('id, display_name, email')
        .in('id', adminIds) as any;

      const adminMap = new Map((admins || []).map((a: any) => [a.id, a]));
      sessionMap.forEach((session) => {
        if (session.assigned_admin_id) {
          const admin = adminMap.get(session.assigned_admin_id) as any;
          if (admin) {
            session.admin_name = admin.display_name;
            session.admin_email = admin.email;
          }
        }
      });
    }

    const enrichedSessions = Array.from(sessionMap.values());

    // Get stats
    const { data: statsData } = await db
      .from('ai_chat_sessions')
      .select('status, is_ai_paused') as any;

    const stats = {
      active: (statsData || []).filter((s: any) => s.status === 'active').length,
      handed_off: (statsData || []).filter((s: any) => s.status === 'handed_off' || s.is_ai_paused).length,
      closed_today: (statsData || []).filter((s: any) => 
        s.status === 'closed' && 
        s.closed_at && 
        new Date(s.closed_at).toDateString() === new Date().toDateString()
      ).length,
    };

    return NextResponse.json({
      sessions: enrichedSessions,
      pagination: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
      stats,
    });

  } catch (err: any) {
    console.error('[Admin API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
