import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/session/[id]/poll?since=<ISO timestamp>
 *
 * Lightweight polling endpoint for the chat widget.
 * Returns:
 *   - is_ai_paused: current circuit-breaker state
 *   - status: session status
 *   - messages: admin + system messages created after `since`
 *
 * Called every 2 seconds by the widget to receive admin messages
 * and handoff state changes without relying on SSE/WebSockets.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: sessionId } = params;
  const since = req.nextUrl.searchParams.get('since') ?? new Date(0).toISOString();

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    // 1. Session state
    const { data: session, error: sessionErr } = await (db.from('ai_chat_sessions') as any)
      .select('id, is_ai_paused, status')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 2. New admin + system messages since the given timestamp
    const { data: newMessages } = await (db.from('ai_chat_messages') as any)
      .select('id, role, content, created_at, sent_by_admin_id')
      .eq('session_id', sessionId)
      .in('role', ['admin', 'system'])
      .gt('created_at', since)
      .order('created_at', { ascending: true });

    // 3. Resolve admin display names
    const adminIds = Array.from(new Set(
      (newMessages ?? [])
        .filter((m: any) => m.role === 'admin' && m.sent_by_admin_id)
        .map((m: any) => m.sent_by_admin_id as string)
    ));

    const adminNameMap: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await (db.from('ai_admin_users') as any)
        .select('id, display_name')
        .in('id', adminIds);
      (admins ?? []).forEach((a: any) => { adminNameMap[a.id] = a.display_name; });
    }

    const enriched = (newMessages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      admin_display_name: m.sent_by_admin_id
        ? (adminNameMap[m.sent_by_admin_id] ?? 'Agent')
        : undefined,
    }));

    return NextResponse.json({
      is_ai_paused: session.is_ai_paused,
      status: session.status,
      messages: enriched,
    });

  } catch (err: any) {
    console.error('[SessionPollRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
