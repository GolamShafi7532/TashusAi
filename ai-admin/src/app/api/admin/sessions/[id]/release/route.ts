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
        is_ai_paused: false,
        status: 'active',
        assigned_admin_id: null,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateErr || !session) {
      console.error('[ReleaseRoute] Update failed:', updateErr?.message);
      return NextResponse.json({ error: 'Failed to release session' }, { status: 500 });
    }

    const systemMsgContent = '✅ Human agent left. Tashus AI has resumed — feel free to continue!';
    await (db.from('ai_chat_messages') as any).insert({
      session_id: sessionId,
      role: 'system',
      content: systemMsgContent,
    });

    try {
      await getRedisClient().publish(
        buildSessionControlChannel(sessionId),
        JSON.stringify({
          type: 'control',
          paused: false,
          message: { role: 'system', content: systemMsgContent },
        })
      );
    } catch (e) {
      console.warn('[ReleaseRoute] Redis publish failed (non-critical):', e);
    }

    return NextResponse.json({ success: true, session });
  } catch (err: any) {
    console.error('[ReleaseRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
