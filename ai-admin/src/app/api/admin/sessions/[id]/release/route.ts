import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';
import { getRedisClient, buildSessionControlChannel } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sessions/[id]/release
 * Returns session control back to AI bot (circuit-breaker release).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: sessionId } = params;

    // 1. Authenticate admin
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
        is_ai_paused: false,
        status: 'active',
        assigned_admin_id: null,
      } as any)
      .eq('id', sessionId)
      .select()
      .single() as any;

    if (updateErr || !session) {
      console.error('[ReleaseRoute] Update failed:', updateErr?.message);
      return NextResponse.json({ error: 'Failed to release session back to AI' }, { status: 500 });
    }

    // 3. Insert system message
    const systemMsgContent = 'Human agent left. Returning control to Tashus AI.';
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
        paused: false,
        type: 'control',
        message: {
          role: 'system',
          content: systemMsgContent,
        },
      })
    );

    return NextResponse.json({ success: true, session });
  } catch (err: any) {
    console.error('[ReleaseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
