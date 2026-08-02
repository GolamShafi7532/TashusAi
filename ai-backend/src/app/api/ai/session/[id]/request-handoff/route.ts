/**
 * POST /api/ai/session/[id]/request-handoff
 * Widget calls this when the user asks for human assistance.
 * Activates circuit breaker and notifies all connected admins.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { redis, buildSessionControlChannel } from '@/lib/redis';

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionId = params.id;
    const body = await req.json().catch(() => ({}));
    const { reason = 'user_requested' } = body;

    // Fetch current session state
    const { data: session, error: fetchErr } = await (db.from('ai_chat_sessions') as any)
      .select('id, is_ai_paused, status, visitor_id').eq('id', sessionId).single();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Idempotent — already in handoff
    if (session.is_ai_paused) {
      return NextResponse.json({ success: true, message: 'Handoff already active. An agent will respond soon.' });
    }

    // Activate circuit breaker
    const { error: updateErr } = await (db.from('ai_chat_sessions') as any)
      .update({ is_ai_paused: true, status: 'handed_off', last_message_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateErr) {
      console.error('[HandoffRoute] Update failed:', updateErr.message);
      return NextResponse.json({ error: 'Failed to request handoff' }, { status: 500 });
    }

    // Insert system message for widget timeline
    const systemMsg = '🤝 Connecting you to a human agent — please hold on for a moment.';
    await (db.from('ai_chat_messages') as any).insert({ session_id: sessionId, role: 'system', content: systemMsg });

    // Publish to session channel so widget SSE can show the system message
    try {
      await redis.publish(buildSessionControlChannel(sessionId), JSON.stringify({
        type: 'control', paused: true,
        message: { role: 'system', content: systemMsg },
      }));
    } catch (e) { console.warn('[HandoffRoute] session publish failed:', e); }

    // Publish to admin notifications channel so all admins get the alert
    try {
      await redis.publish('admin:notifications', JSON.stringify({
        type: 'handoff_requested',
        session_id: sessionId,
        visitor_id: session.visitor_id,
        reason,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) { console.warn('[HandoffRoute] admin notification failed:', e); }

    console.log(`[HandoffRoute] ✅ Handoff activated | session=${sessionId} reason=${reason}`);
    return NextResponse.json({ success: true, message: 'An agent will be with you shortly.' });

  } catch (err: any) {
    console.error('[HandoffRoute] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
