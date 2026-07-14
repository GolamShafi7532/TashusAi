import { db } from '@/db/client';
import { processMessageStream } from '@/agent/orchestrator';
import type { InboundMessageEnvelope } from './types';

/**
 * Universal entry point for non-streaming multi-channel incoming messages (e.g. Email, SMS, Voice).
 * Resolves session keys, runs the AI orchestrator synchronously, aggregates responses, and saves states.
 */
export async function processInboundMessage(envelope: InboundMessageEnvelope): Promise<{
  sessionId: string;
  response: string;
  isPaused: boolean;
}> {
  const { channel, sessionKey, text } = envelope;

  // 1. Resolve or create chat session for this channel + sessionKey combination
  let { data: session, error: sessionErr } = await db
    .from('ai_chat_sessions')
    .select('*')
    .eq('visitor_id', sessionKey)
    .eq('channel', channel)
    .maybeSingle() as any;

  if (sessionErr) {
    throw new Error(`Failed to query session: ${sessionErr.message}`);
  }

  if (!session) {
    // Initialize new session
    const { data: newSession, error: createErr } = await db
      .from('ai_chat_sessions')
      .insert({
        visitor_id: sessionKey,
        channel,
        status: 'active',
        is_ai_paused: false,
        locale: 'en',
        metadata: envelope.metadata || {},
      } as any)
      .select()
      .single() as any;

    if (createErr || !newSession) {
      throw new Error(`Failed to initialize session: ${createErr?.message}`);
    }
    session = newSession;
  }

  // 2. Circuit-breaker check: If AI is paused, save user message and return early
  if (session.is_ai_paused) {
    await db.from('ai_chat_messages').insert({
      session_id: session.id,
      role: 'user',
      content: text,
    } as any);

    return {
      sessionId: session.id,
      response: 'Support bot currently paused. A human agent has taken over this conversation.',
      isPaused: true,
    };
  }

  // 3. AI is active — run the orchestrator loop, aggregating streaming text chunks
  let accumulatedResponse = '';
  try {
    const orchestratorStream = processMessageStream(session.id, text);
    for await (const event of orchestratorStream) {
      if (event.type === 'token') {
        accumulatedResponse += event.text;
      } else if (event.type === 'done') {
        accumulatedResponse = event.message;
      }
    }
  } catch (err: any) {
    console.error(`[processInboundMessage] Orchestrator loop failed for session ${session.id}:`, err);
    throw err;
  }

  return {
    sessionId: session.id,
    response: accumulatedResponse,
    isPaused: false,
  };
}
