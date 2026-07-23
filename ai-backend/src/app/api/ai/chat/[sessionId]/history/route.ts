import { NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic'; // Prevent Next.js from caching this route

/**
 * GET /api/ai/chat/[sessionId]/history
 * Retrieves full message history for a given session.
 * Used to rehydrate the widget UI on mount or reload.
 */
export async function GET(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId parameter required' }, { status: 400 });
  }

  try {
    // Check if session exists first and retrieve circuit-breaker state
    const { data: session, error: sessionErr } = await db
      .from('ai_chat_sessions')
      .select('id, is_ai_paused, status')
      .eq('id', sessionId)
      .limit(1)
      .maybeSingle() as any;

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Retrieve all messages for the session, ordered chronologically
    // Include sent_by_admin_id so we can resolve the admin's display name
    const { data: messages, error: messagesErr } = await (db
      .from('ai_chat_messages') as any)
      .select('id,role,content,tool_calls,tool_results,created_at,sent_by_admin_id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesErr) {
      return NextResponse.json(
        { error: `Failed to fetch messages: ${messagesErr.message}` },
        { status: 500 }
      );
    }

    // Resolve admin display names for admin-role messages
    const adminIds = Array.from(new Set(
      (messages ?? [])
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

    // Enrich messages with admin_display_name
    const enriched = (messages ?? []).map((m: any) => ({
      ...m,
      admin_display_name: m.sent_by_admin_id ? (adminNameMap[m.sent_by_admin_id] ?? 'Agent') : undefined,
    }));

    return NextResponse.json({
      messages: enriched,
      is_ai_paused: session.is_ai_paused ?? false,
      status: session.status ?? 'active',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    });

  } catch (err: any) {
    console.error('[HistoryRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
