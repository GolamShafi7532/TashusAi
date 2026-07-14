import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';
import { getRedisClient, buildSessionControlChannel } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sessions/[id]/messages
 * Sends a human agent message into the chat session, bypassing the AI loop.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: sessionId } = params;
    const { content } = await req.json().catch(() => ({}));

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // 1. Authenticate the admin
    const token = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_access_token='))
      ?.split('=')[1];

    const admin = token ? await verifyJwt(token) : null;
    if (!admin || !admin.userId) {
      return NextResponse.json({ error: 'Unauthorized admin access' }, { status: 401 });
    }

    // 2. Validate session state
    const { data: session } = await db
      .from('ai_chat_sessions')
      .select('is_ai_paused')
      .eq('id', sessionId)
      .limit(1)
      .single() as any;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.is_ai_paused) {
      return NextResponse.json({ error: 'AI is active. You must takeover first.' }, { status: 423 });
    }

    // 3. Insert agent message into database
    const { data: msg, error: insertErr } = await db
      .from('ai_chat_messages')
      .insert({
        session_id: sessionId,
        role: 'admin',
        content: content.trim(),
        sent_by_admin_id: admin.userId,
      } as any)
      .select()
      .single() as any;

    if (insertErr || !msg) {
      console.error('[AdminMessageRoute] Database insertion failed:', insertErr?.message);
      return NextResponse.json({ error: 'Failed to send admin message' }, { status: 500 });
    }

    // Update last_message_at on session
    await (db.from('ai_chat_sessions') as any)
      .update({ last_message_at: msg.created_at })
      .eq('id', sessionId);

    // 4. Publish message to Redis control channel to relay to widget's SSE stream
    const controlChannel = buildSessionControlChannel(sessionId);
    await getRedisClient().publish(
      controlChannel,
      JSON.stringify({
        type: 'message',
        message: {
          id: msg.id,
          role: 'admin',
          content: msg.content,
          created_at: msg.created_at,
        },
      })
    );

    return NextResponse.json({ success: true, message: msg });
  } catch (err: any) {
    console.error('[AdminMessageRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
