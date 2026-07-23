/**
 * POST /api/admin/sessions/[id]/message
 * Admin sends a message to the user during handoff.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    const body = await req.json();
    const { content, admin_id } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    if (!admin_id) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
    }

    // Verify session exists and is in handoff mode
    const { data: session, error: sessionError } = await db
      .from('ai_chat_sessions')
      .select('id, is_ai_paused, status, assigned_admin_id')
      .eq('id', sessionId)
      .single() as any;

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.is_ai_paused) {
      return NextResponse.json(
        { error: 'Session is not in handoff mode. AI is currently active.' },
        { status: 400 }
      );
    }

    // Verify admin exists
    const { data: admin, error: adminError } = await db
      .from('ai_admin_users')
      .select('id, display_name, is_active')
      .eq('id', admin_id)
      .single() as any;

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    if (!admin.is_active) {
      return NextResponse.json({ error: 'Admin account is inactive' }, { status: 403 });
    }

    // Insert admin message
    const { data: message, error: insertError } = await (db.from('ai_chat_messages') as any)
      .insert({
        session_id: sessionId,
        role: 'admin',
        content: content.trim(),
        sent_by_admin_id: admin_id,
      })
      .select()
      .single() as any;

    if (insertError) {
      console.error('[Admin API] Failed to insert message:', insertError);
      return NextResponse.json(
        { error: 'Failed to save message', details: insertError.message },
        { status: 500 }
      );
    }

    // Assign admin to session if not already assigned
    if (!session.assigned_admin_id) {
      await (db.from('ai_chat_sessions') as any)
        .update({ assigned_admin_id: admin_id })
        .eq('id', sessionId) as any;
    }

    // Update last_message_at timestamp
    await (db.from('ai_chat_sessions') as any)
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId) as any;

    // Publish message to widget via Redis (for real-time delivery)
    try {
      await redis.publish(`session:${sessionId}:messages`, JSON.stringify({
        type: 'admin_message',
        message: {
          id: message.id,
          role: 'admin',
          content: content.trim(),
          admin_name: admin.display_name,
          created_at: message.created_at,
        },
      }));
    } catch (redisErr) {
      console.warn('[Admin API] Redis publish failed (non-critical):', redisErr);
    }

    return NextResponse.json({
      success: true,
      message_id: message.id,
      created_at: message.created_at,
    });

  } catch (err: any) {
    console.error('[Admin API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
