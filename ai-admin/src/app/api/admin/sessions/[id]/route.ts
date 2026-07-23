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
      .in('role', ['user', 'assistant', 'admin', 'system'])
      .order('created_at', { ascending: true });

    if (messagesErr) {
      console.error('[SessionDetailRoute] Messages DB Error:', messagesErr.message);
      return NextResponse.json({ error: 'Failed to retrieve messages' }, { status: 500 });
    }

    // 3. Enrich admin messages with admin names
    const adminIds = Array.from(new Set(
      (messages || [])
        .filter((m: any) => m.role === 'admin' && m.sent_by_admin_id)
        .map((m: any) => m.sent_by_admin_id)
    ));

    const adminNameMap: Record<string, any> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await (db.from('ai_admin_users') as any)
        .select('id, display_name, email')
        .in('id', adminIds);
      (admins || []).forEach((a: any) => {
        adminNameMap[a.id] = { name: a.display_name, email: a.email };
      });
    }

    const enrichedMessages = (messages || []).map((m: any) => ({
      ...m,
      admin_name: m.sent_by_admin_id ? adminNameMap[m.sent_by_admin_id]?.name : undefined,
      admin_email: m.sent_by_admin_id ? adminNameMap[m.sent_by_admin_id]?.email : undefined,
    }));

    // 4. Get admin name for session if assigned
    let sessionAdminName = null;
    if (session.assigned_admin_id) {
      const { data: adminUser } = await (db.from('ai_admin_users') as any)
        .select('display_name')
        .eq('id', session.assigned_admin_id)
        .single();
      sessionAdminName = adminUser?.display_name;
    }

    return NextResponse.json({ 
      session: { ...session, admin_name: sessionAdminName }, 
      messages: enrichedMessages,
      message_count: enrichedMessages.length 
    });
  } catch (err: any) {
    console.error('[SessionDetailRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/sessions/[id]
 * Update session status (e.g., close session).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const updates: any = {};
    if (body.status) updates.status = body.status;
    if (body.status === 'closed') updates.closed_at = new Date().toISOString();

    const { data: session, error } = await (db.from('ai_chat_sessions') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !session) {
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

    return NextResponse.json({ success: true, session });
  } catch (err: any) {
    console.error('[SessionPatchRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
