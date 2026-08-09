import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { resolveAdmin } from '@/lib/auth';
import { getRedisClient, buildSessionControlChannel } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: sessionId } = params;
    const { content } = await req.json().catch(() => ({}));

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    let admin;
    try {
      admin = await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate session is paused
    const { data: session } = await (db.from('ai_chat_sessions') as any)
      .select('is_ai_paused')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (!session.is_ai_paused) {
      return NextResponse.json({ error: 'AI is active — take over first' }, { status: 423 });
    }

    // Insert admin message
    const { data: msg, error: insertErr } = await (db.from('ai_chat_messages') as any)
      .insert({
        session_id: sessionId,
        role: 'admin',
        content: content.trim(),
        sent_by_admin_id: admin.userId,
      })
      .select()
      .single();

    if (insertErr || !msg) {
      console.error('[MessagesRoute] Insert failed:', insertErr?.message);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Fire session last_message_at update & Redis publish in parallel without blocking HTTP response
    Promise.all([
      (db.from('ai_chat_sessions') as any)
        .update({ last_message_at: msg.created_at })
        .eq('id', sessionId),
      getRedisClient().publish(
        buildSessionControlChannel(sessionId),
        JSON.stringify({
          type: 'message',
          message: {
            id: msg.id,
            role: 'admin',
            content: msg.content,
            created_at: msg.created_at,
            admin_display_name: admin.displayName,
          },
        })
      ).catch((e) => console.warn('[MessagesRoute] Redis publish failed:', e))
    ]).catch((err) => console.error('[MessagesRoute] Background tasks failed:', err));

    return NextResponse.json({ success: true, message: msg });
  } catch (err: any) {
    console.error('[MessagesRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
