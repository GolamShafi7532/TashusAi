/**
 * PUT /api/admin/sessions/[id]/resume
 * Admin marks handoff resolved and resumes AI operation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    const body = await req.json();
    const { admin_id } = body;

    if (!admin_id) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
    }

    // Verify session exists
    const { data: session, error: sessionError } = await (db.from('ai_chat_sessions') as any)
      .select('id, is_ai_paused, status')
      .eq('id', sessionId)
      .single() as any;

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.is_ai_paused) {
      return NextResponse.json(
        { error: 'Session is not paused. AI is already active.' },
        { status: 400 }
      );
    }

    // Resume AI: update session state
    const { error: updateError } = await (db.from('ai_chat_sessions') as any)
      .update({
        is_ai_paused: false,
        status: 'active',
      })
      .eq('id', sessionId) as any;

    if (updateError) {
      console.error('[Admin API] Failed to resume session:', updateError);
      return NextResponse.json(
        { error: 'Failed to resume AI', details: updateError.message },
        { status: 500 }
      );
    }

    // Insert system message to notify user
    await (db.from('ai_chat_messages') as any)
      .insert({
        session_id: sessionId,
        role: 'system',
        content: '✅ AI assistant resumed — feel free to ask me anything!',
      }) as any;

    // Publish state change to widget via Redis
    try {
      await redis.publish(`session:${sessionId}:messages`, JSON.stringify({
        type: 'ai_resumed',
        message: {
          role: 'system',
          content: '✅ AI assistant resumed — feel free to ask me anything!',
          created_at: new Date().toISOString(),
        },
      }));
    } catch (redisErr) {
      console.warn('[Admin API] Redis publish failed (non-critical):', redisErr);
    }

    return NextResponse.json({
      success: true,
      message: 'AI resumed successfully',
    });

  } catch (err: any) {
    console.error('[Admin API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
