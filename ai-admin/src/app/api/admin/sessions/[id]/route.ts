import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sessions/[id]
 * Fetch detailed chat session and message history.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    // 1. Fetch session details
    const { data: session, error: sessionErr } = await db
      .from('ai_chat_sessions')
      .select('*')
      .eq('id', id)
      .limit(1)
      .single() as any;

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 2. Fetch full message history ordered chronologically
    const { data: messages, error: messagesErr } = await (db
      .from('ai_chat_messages') as any)
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (messagesErr) {
      console.error('[SessionDetailRoute] Messages DB Error:', messagesErr.message);
      return NextResponse.json({ error: 'Failed to retrieve messages' }, { status: 500 });
    }

    return NextResponse.json({ session, messages });
  } catch (err: any) {
    console.error('[SessionDetailRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
