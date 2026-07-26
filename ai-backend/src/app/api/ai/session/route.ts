import { NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/session
 * Create or resume a chat session identified by a visitor_id cookie (or body)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const visitorId = body.visitorId ?? new URL(req.url).searchParams.get('visitorId');

  if (!visitorId) {
    return NextResponse.json({ error: 'visitorId required' }, { status: 400 });
  }

  // Find existing session or create a new one
  const { data: existing } = await (db.from('ai_chat_sessions') as any)
    .select('*')
    .eq('visitor_id', visitorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ sessionId: existing.id });
  }

  const insertRes = (await db.from('ai_chat_sessions').insert({ visitor_id: visitorId } as any).select().single()) as any;

  const data = insertRes?.data;
  const error = insertRes?.error;

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json({ sessionId: data.id });
}
