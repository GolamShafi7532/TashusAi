/**
 * Session Summarization Worker — BullMQ job processor.
 *
 * Source of truth: AI Chatbot blueprint.md §3.4
 */
import type { Job } from 'bullmq';
import { createWorker, type SummarizeSessionJobData, QUEUE_NAMES } from '@/lib/queue';
import { db } from '@/db/client';
import { generateCompletion } from '@/agent/llm';

async function processSummarizeSession(job: Job<SummarizeSessionJobData>): Promise<void> {
  const { sessionId } = job.data;
  console.log(`[SummarizeWorker] Starting summarization for session: ${sessionId}`);

  // 1. Fetch the session metadata
  const { data: session, error: sessionErr } = await db
    .from('ai_chat_sessions')
    .select('metadata')
    .eq('id', sessionId)
    .single() as any;

  if (sessionErr || !session) {
    throw new Error(`Session ${sessionId} not found for summarization: ${sessionErr?.message}`);
  }

  // 2. Fetch all messages in chronological order
  const { data: messages, error: messagesErr } = await db
    .from('ai_chat_messages')
    .select('role,content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true }) as any;

  if (messagesErr || !messages) {
    throw new Error(`Failed to fetch messages for session ${sessionId}: ${messagesErr?.message}`);
  }

  const N = messages.length;
  if (N <= 6) {
    console.log(`[SummarizeWorker] Session ${sessionId} has ${N} messages (<= 6). Summarization not needed.`);
    return;
  }

  // We summarize everything except the most recent 6 messages
  const messagesToSummarize = messages.slice(0, N - 6);
  const transcript = messagesToSummarize
    .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const existingSummary = session.metadata?.conversation_summary ?? '';

  // 3. Call LLM to summarize/reconcile
  const prompt = [
    `You are a conversation summarization bot. Compress the provided transcript into 1-2 sentences of durable facts only — user intent, dates, location, constraints.`,
    existingSummary ? `Existing Summary:\n${existingSummary}` : '',
    `New Transcript to Reconcile & Append:\n${transcript}`,
    `Provide only the reconciled, single-paragraph updated summary with no explanations:`,
  ].filter(Boolean).join('\n\n');

  let newSummary = '';
  try {
    const response = await generateCompletion(prompt);
    newSummary = response.trim();
  } catch (err) {
    throw new Error(`LLM summarization failed: ${String(err)}`);
  }

  if (!newSummary) {
    throw new Error('LLM returned an empty summary');
  }

  // 4. Write back to database
  const updatedMetadata = {
    ...(session.metadata || {}),
    conversation_summary: newSummary,
  };

  const { error: updateErr } = await (db.from('ai_chat_sessions') as any)
    .update({ metadata: updatedMetadata })
    .eq('id', sessionId) as any;

  if (updateErr) {
    throw new Error(`Failed to update session metadata for ${sessionId}: ${updateErr.message}`);
  }

  console.log(`[SummarizeWorker] ✅ Session ${sessionId} summary updated: "${newSummary}"`);
}

export function startSummarizeWorker() {
  return createWorker<SummarizeSessionJobData>(
    QUEUE_NAMES.SUMMARIZE_SESSION,
    processSummarizeSession,
    2 // concurrency
  );
}
