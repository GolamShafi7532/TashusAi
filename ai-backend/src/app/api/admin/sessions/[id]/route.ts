/**
 * GET /api/admin/sessions/[id]
 * Returns full session detail with complete message history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;

    // Fetch session details
    const { data: session, error: sessionError } = await db
      .from('ai_chat_sessions')
      .select(`
        id, visitor_id, tashus_user_id, tashus_user_role,
        status, is_ai_paused, channel, assigned_admin_id,
        started_at, last_message_at, closed_at, metadata, locale
      `)
      .eq('id', sessionId)
      .single() as any;

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch admin info if assigned
    let adminInfo = null;
    if (session.assigned_admin_id) {
      const { data: admin } = await db
        .from('ai_admin_users')
        .select('id, display_name, email, role')
        .eq('id', session.assigned_admin_id)
        .single() as any;
      adminInfo = admin;
    }

    // Fetch messages — only human-visible roles, chronological
    const { data: messages, error: msgError } = await db
      .from('ai_chat_messages')
      .select(`
        id, role, content, created_at,
        tool_calls, tool_results,
        sent_by_admin_id, tokens_in, tokens_out, latency_ms
      `)
      .eq('session_id', sessionId)
      .in('role', ['user', 'assistant', 'admin', 'system'])
      .order('created_at', { ascending: true }) as any;

    if (msgError) {
      console.error('[Admin API] Failed to fetch messages:', msgError);
      return NextResponse.json(
        { error: 'Failed to fetch messages', details: msgError.message },
        { status: 500 }
      );
    }

    // Enrich admin messages with sender info
    const adminIds = [...new Set(
      (messages || [])
        .filter((m: any) => m.sent_by_admin_id)
        .map((m: any) => m.sent_by_admin_id)
    )];

    const adminSenderMap = new Map();
    if (adminIds.length > 0) {
      const { data: adminSenders } = await db
        .from('ai_admin_users')
        .select('id, display_name, email')
        .in('id', adminIds) as any;
      (adminSenders || []).forEach((a: any) => adminSenderMap.set(a.id, a));
    }

    const enrichedMessages = (messages || []).map((m: any) => ({
      ...m,
      admin_name: m.sent_by_admin_id
        ? adminSenderMap.get(m.sent_by_admin_id)?.display_name
        : null,
      admin_email: m.sent_by_admin_id
        ? adminSenderMap.get(m.sent_by_admin_id)?.email
        : null,
    }));

    return NextResponse.json({
      session: {
        ...session,
        admin_name: adminInfo?.display_name,
        admin_email: adminInfo?.email,
        admin_role: adminInfo?.role,
      },
      messages: enrichedMessages,
      message_count: enrichedMessages.filter((m: any) =>
        ['user', 'assistant', 'admin'].includes(m.role)
      ).length,
    });

  } catch (err: any) {
    console.error('[Admin API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
