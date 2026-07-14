import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { processMessage } from '@/agent/orchestrator';

/**
 * POST /api/ai/chat
 * Non-streaming chat endpoint (simple version)
 * Body: { sessionId, text }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = body.sessionId;
  const text = body.text;

  if (!sessionId || !text) return NextResponse.json({ error: 'sessionId and text required' }, { status: 400 });

  // Guard: check is_ai_paused
  const { data: session } = (await db.from('ai_chat_sessions').select('id,is_ai_paused').eq('id', sessionId).single()) as any;
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });
  if (session.is_ai_paused) return NextResponse.json({ error: 'AI paused for this session' }, { status: 423 });

  try {
    const result = await processMessage(sessionId, text);
    return NextResponse.json({ ok: true, assistant: result.message, sources: result.sources });
  } catch (err: any) {
    console.error('[ChatRoute] processMessage error:', err);
    return NextResponse.json({ error: err?.message ?? 'internal' }, { status: 500 });
  }
}
