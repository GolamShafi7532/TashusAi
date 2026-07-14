import { NextResponse } from 'next/server';
import { db } from '@/db/client';

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
    // Check if session exists first
    const { data: session, error: sessionErr } = await db
      .from('ai_chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .limit(1)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Retrieve all messages for the session, ordered chronologically
    const { data: messages, error: messagesErr } = await db
      .from('ai_chat_messages')
      .select('id,role,content,tool_calls,tool_results,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesErr) {
      return NextResponse.json(
        { error: `Failed to fetch messages: ${messagesErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error('[HistoryRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
