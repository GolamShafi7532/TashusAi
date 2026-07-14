import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';
import { getRedisClient, buildSessionControlChannel } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sessions/[id]/takeover
 * Circuit Breaker takeover: Pauses AI model, assigns session to human, and notifies client SSE via Redis Pub/Sub.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: sessionId } = params;

    // 1. Authenticate the admin using the access token cookie
    const token = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_access_token='))
      ?.split('=')[1];

    const admin = token ? await verifyJwt(token) : null;
    if (!admin || !admin.userId) {
      return NextResponse.json({ error: 'Unauthorized admin access' }, { status: 401 });
    }

    // 2. Perform DB update
    const { data: session, error: updateErr } = await (db.from('ai_chat_sessions') as any)
      .update({
        is_ai_paused: true,
        status: 'handed_off',
        assigned_admin_id: admin.userId,
      } as any)
      .eq('id', sessionId)
      .select()
      .single() as any;

    if (updateErr || !session) {
      console.error('[TakeoverRoute] Update failed:', updateErr?.message);
      return NextResponse.json({ error: 'Failed to pause AI and takeover session' }, { status: 500 });
    }

    // 3. Insert system message into history
    const systemMsgContent = `${admin.displayName} (Human Agent) has joined the conversation.`;
    await db.from('ai_chat_messages').insert({
      session_id: sessionId,
      role: 'system',
      content: systemMsgContent,
    } as any);

    // 4. Publish control event to Redis Pub/Sub channel
    const controlChannel = buildSessionControlChannel(sessionId);
    await getRedisClient().publish(
      controlChannel,
      JSON.stringify({
        paused: true,
        type: 'control',
        message: {
          role: 'system',
          content: systemMsgContent,
        },
      })
    );

    return NextResponse.json({ success: true, session });
  } catch (err: any) {
    console.error('[TakeoverRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
