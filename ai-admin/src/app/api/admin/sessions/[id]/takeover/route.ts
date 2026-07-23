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

    let admin;
    try {
      admin = await resolveAdmin(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: session, error: updateErr } = await (db.from('ai_chat_sessions') as any)
      .update({
        is_ai_paused: true,
        status: 'handed_off',
        assigned_admin_id: admin.userId,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateErr || !session) {
      return NextResponse.json({ error: 'Failed to takeover session' }, { status: 500 });
    }

    const systemMsgContent = `${admin.displayName} has joined the conversation. AI is now paused.`;
    await (db.from('ai_chat_messages') as any).insert({
      session_id: sessionId,
      role: 'system',
      content: systemMsgContent,
    });

    try {
      await getRedisClient().publish(
        buildSessionControlChannel(sessionId),
        JSON.stringify({ type: 'control', paused: true, message: { role: 'system', content: systemMsgContent } })
      );
    } catch (e) {
      console.warn('[TakeoverRoute] Redis publish failed (non-critical):', e);
    }

    return NextResponse.json({ success: true, session });
  } catch (err: any) {
    console.error('[TakeoverRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
