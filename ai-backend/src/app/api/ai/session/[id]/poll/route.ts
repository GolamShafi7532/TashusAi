/**
 * GET /api/ai/session/[id]/poll
 * Poll route called by the widget during handoff or fallback.
 * Returns current session circuit-breaker state and any messages created after `since`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

function resolveAllowedOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return '*';
  const raw = process.env.WIDGET_ALLOWED_ORIGINS ?? '*';
  if (raw.trim() === '*') return requestOrigin;

  const allowed = new Set(
    raw.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
  );
  return allowed.has(requestOrigin.toLowerCase()) ? requestOrigin : 'null';
}

function corsHeaders(requestOrigin: string | null) {
  const origin = resolveAllowedOrigin(requestOrigin);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export async function OPTIONS(req: Request) {
  const origin = resolveAllowedOrigin(req.headers.get('origin'));
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': origin === '*' ? 'false' : 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '7200',
      'Vary': 'Origin',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestOrigin = req.headers.get('origin');
  const headers = corsHeaders(requestOrigin);
  const sessionId = params.id;

  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');

    // Fetch session state
    const { data: session, error: sessionErr } = await (db.from('ai_chat_sessions') as any)
      .select('id, is_ai_paused, status')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404, headers }
      );
    }

    // Query messages created after `since` (only system and admin messages)
    let query = (db.from('ai_chat_messages') as any)
      .select('id, role, content, created_at, sent_by_admin_id')
      .eq('session_id', sessionId)
      .neq('role', 'assistant')
      .order('created_at', { ascending: true });

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data: messages, error: msgErr } = await query;

    if (msgErr) {
      console.error('[SessionPollRoute] Error fetching messages:', msgErr.message);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      {
        is_ai_paused: session.is_ai_paused ?? false,
        status: session.status ?? 'active',
        messages: (messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          admin_display_name: m.sent_by_admin_id ? 'Human Agent' : undefined,
        })),
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error('[SessionPollRoute] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers }
    );
  }
}
