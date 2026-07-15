/**
 * Agent orchestrator: persists user messages, loads config and memory,
 * calls the LLM with a rolling-window prompt, handles tool calls, and
 * enqueues background summarization when the conversation grows.
 *
 * Source of truth: AI Chatbot blueprint.md §3.4
 *
 * v3.1.0 Changes:
 *  - Accepts optional UserContext (timezone, localTime) from the frontend
 *  - Injects localised date/time block at top of system prompt so the LLM
 *    can accurately resolve relative dates like "tomorrow" or "this weekend"
 */
import { db, AiAgentConfig } from '@/db/client';
import { retrieve, searchKnowledgeBaseTool } from '@/rag/retriever';
import { ragDedupCache } from '@/rag/dedup-cache';
import { generateCompletionStream } from '@/agent/llm';
import { executeTool, AGENT_TOOLS } from '@/agent/tools';
import { validateToolCall } from '@/agent/tool-executor';
import { detectHallucinations } from '@/agent/fact-checker';
import { loadActiveAgentConfig } from '@/agent/config';
import { enqueueSummarizeSession } from '@/lib/queue';
import { metrics } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import type { UserContext } from '@/app/api/ai/chat/stream/route';

type ConversationMessage = { role: string; content: string };

// ── Timezone abbreviation map ─────────────────────────────────────────────────
const TZ_ABBR: Record<string, string> = {
  'Australia/Sydney':    'AEST/AEDT',
  'Australia/Melbourne': 'AEST/AEDT',
  'Australia/Brisbane':  'AEST',
  'Australia/Perth':     'AWST',
  'Australia/Adelaide':  'ACST/ACDT',
  'Australia/Darwin':    'ACST',
  'Australia/Hobart':    'AEST/AEDT',
  'Pacific/Auckland':    'NZST/NZDT',
  'Asia/Singapore':      'SGT',
  'America/New_York':    'EST/EDT',
  'America/Los_Angeles': 'PST/PDT',
  'Europe/London':       'GMT/BST',
};

/**
 * Build the date/time context block injected into the system prompt.
 * This lets the LLM resolve "tomorrow", "next weekend", etc. correctly.
 */
function buildDateTimeContext(userContext: UserContext): string {
  const localDate = new Date(userContext.localTime);
  const tzAbbr = TZ_ABBR[userContext.timezone] ?? 'Local Time';

  // Format as: "Wednesday, 16 July 2026 at 2:30 pm AEST"
  const formattedLocal = localDate.toLocaleString('en-AU', {
    timeZone: userContext.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Tomorrow's date in the user's timezone
  const tomorrow = new Date(localDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-AU', {
    timeZone: userContext.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `---
CURRENT USER DATE & TIME:
${formattedLocal} (${tzAbbr})
Timezone: ${userContext.timezone}
ISO Timestamp (UTC): ${userContext.localTime}

When user says "tomorrow" → ${tomorrowStr}
When user says "tonight" → same date above, evening hours
When user says "this weekend" → upcoming Saturday/Sunday from the date above
All pickup/return dates you generate MUST be in ISO 8601 UTC format.
---`;
}

/**
 * Lightweight intent classifier — avoids running the expensive semantic
 * retrieval for transactional, greeting, or vehicle-search messages.
 * Only policy/FAQ/document questions need RAG context injected.
 */
function intentNeedsRag(text: string): boolean {
  const t = text.toLowerCase().trim();

  // Greetings & short messages — no RAG needed
  if (t.split(/\s+/).length <= 3) return false;

  // Vehicle / booking intent — tools will handle it
  const transactionalPattern =
    /\b(book|rent|reserve|hire|vehicle|car|suv|sedan|hatchback|ute|van|available|availability|pickup|return|date|from|voucher|discount|code|promo)\b/i;
  if (transactionalPattern.test(t)) return false;

  // Explicit policy / FAQ signals → needs RAG
  const policyPattern =
    /\b(policy|rule|allow|permit|smoke|smoking|cancel|cancellation|insurance|excess|deposit|fee|age|limit|service|operate|location|city|state|region|hour|document|agreement|term|condition|requirement)\b/i;
  if (policyPattern.test(t)) return true;

  // Default: run RAG for anything else that isn't clearly transactional
  return true;
}

async function loadConversationState(sessionId: string) {
  const [{ data: session }, { data: messages }] = await Promise.all([
    db.from('ai_chat_sessions').select('metadata').eq('id', sessionId).single(),
    db.from('ai_chat_messages')
      .select('role,content,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(6),
  ]) as any;

  const summary = session?.metadata?.conversation_summary ?? '';
  // Reversing so they are chronological
  const recentMessages = (messages ?? []).reverse() as { role: string; content: string }[];

  // Filter out system or tool messages from LLM context window to keep role structure correct,
  // and map 'admin' role to 'assistant' so the assistant knows what the human agent said.
  const formattedMessages = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'admin')
    .map((m) => ({
      role: m.role === 'admin' ? 'assistant' : m.role,
      content: m.content,
    }));

  return { summary, recentMessages: formattedMessages };
}

async function maybeEnqueueSummarization(sessionId: string) {
  const countRes = (await db
    .from('ai_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)) as any;

  const count = Number(countRes?.count ?? 0);
  if (count > 6) {
    await enqueueSummarizeSession(sessionId);
  }
}

/**
 * Generator function that streams events from the agent chat loop.
 */
export async function* processMessageStream(sessionId: string, userText: string, userContext?: UserContext) {
  const turnStart = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Orchestrator] ► New message | session=${sessionId}`);
  console.log(`[Orchestrator] User: "${userText.slice(0, 120)}"`);
  console.log(`${'='.repeat(60)}`);

  metrics.increment('requests-started');

  // 1. Insert user message
  await db.from('ai_chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: userText,
  } as any);

  // 2. Load config and memory
  const [config, conversation] = await Promise.all([
    loadActiveAgentConfig(),
    loadConversationState(sessionId),
  ]);

  console.log(`[Orchestrator] Config: model=${config.model}, tools=[${config.enabled_tools.join(', ')}], is_active=${config.is_active}`);

  // Global Kill-Switch Check (SEC-15)
  if (!config || config.is_active === false) {
    const offlineMessage = "Tashus AI Support is currently offline. A human representative will get back to you shortly.";
    await db.from('ai_chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: offlineMessage,
    } as any);
    yield { type: 'done' as const, message: offlineMessage, sources: [] };
    return;
  }

  // 3. Run retrieval — only if the query likely needs policy/FAQ context
  const ragNeeded = intentNeedsRag(userText);
  const retrieval = ragNeeded
    ? await retrieve(userText)
    : { context: '', sources: [] };

  console.log(`[Orchestrator] RAG retrieval: ${ragNeeded ? retrieval.sources.length + ' sources found' : 'skipped (transactional/greeting intent)'}`);
  if (ragNeeded && retrieval.sources.length > 0) {
    retrieval.sources.forEach((s, i) => console.log(`[Orchestrator]   source[${i}]: ${s.label.slice(0, 80)}`));

    // v3.1.0 Phase B.1.2: Cache retrieval result for dedup — prevents the
    // search_knowledge_base tool from fetching the same content again this turn
    await ragDedupCache.store(sessionId, userText, retrieval.context);
  } else if (ragNeeded) {
    console.log(`[Orchestrator]   No matching knowledge base entries (mock embeddings may be active)`);
  }

  // Prepare system prompt split for Groq prefix caching (Phase B.1.1):
  //   - staticSystem: byte-identical on every request → Groq caches at 50% cost
  //   - dynamicContext: datetime + RAG + summary → billed normally, but smaller
  const staticSystem = config.system_prompt.trim();

  const dynamicContextParts = [
    userContext ? buildDateTimeContext(userContext) : '',
    conversation.summary ? `Conversation summary so far:\n${conversation.summary}` : '',
    retrieval.context ? `Retrieved knowledge base content:\n${retrieval.context}` : '',
  ].filter(Boolean);
  const dynamicContext = dynamicContextParts.join('\n\n');

  // Keep the combined systemPrompt for any path that still needs it (non-Grok)
  const systemPrompt = dynamicContext ? `${staticSystem}\n\n${dynamicContext}` : staticSystem;

  // loopMessages contains the conversation history up to the current turn (inclusive)
  const loopMessages: any[] = [...conversation.recentMessages];
  
  // If the last message is not user text, or loopMessages is empty, make sure the user's current message is present
  const lastMsg = loopMessages[loopMessages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userText) {
    loopMessages.push({ role: 'user', content: userText });
  }

  const toolCalls: Array<{ name: string; params: any; result?: any; logId?: string }> = [];
  let finalMessageText = '';

  const maxRounds = 5;
  for (let round = 0; round < maxRounds; round++) {
    let assistantTextThisRound = '';
    let toolCallThisRound: { id: string; name: string; args: any } | null = null;

    // Force empty tools array on the final round to guarantee a text response
    const toolsToUse = round === maxRounds - 1 ? [] : AGENT_TOOLS;

    console.log(`[Orchestrator] Round ${round + 1}/${maxRounds} — calling LLM${toolsToUse.length > 0 ? ` with ${toolsToUse.length} tools` : ' (no tools — final round)'}`);

    // Call the streaming completion helper
    const stream = generateCompletionStream({
      system: staticSystem,          // static only → Groq prefix cache
      dynamicContext: dynamicContext || undefined,
      messages: loopMessages,
      tools: toolsToUse as any,
      model: config.model,
      temperature: Number(config.temperature),
      maxTokens: config.max_tokens,
    });

    for await (const chunk of stream as any) {
      if (chunk.type === 'text') {
        assistantTextThisRound += chunk.text;
        finalMessageText += chunk.text;
        yield { type: 'token' as const, text: chunk.text };
      } else if (chunk.type === 'tool_call') {
        toolCallThisRound = chunk;
      } else if (chunk.type === 'usage') {
        if (chunk.input_tokens) totalInputTokens += chunk.input_tokens;
        if (chunk.output_tokens) totalOutputTokens = chunk.output_tokens;
      }
    }

    if (toolCallThisRound) {
      const toolName = toolCallThisRound.name;
      const toolArgs = toolCallThisRound.args;
      const toolId = toolCallThisRound.id;

      console.log(`[Orchestrator] 🔧 Tool call: ${toolName}`);
      console.log(`[Orchestrator]   Args: ${JSON.stringify(toolArgs)}`);

      // Yield tool_start
      yield { type: 'tool_start' as const, tool: toolName, input: toolArgs };

      if (!config.enabled_tools.includes(toolName)) {
        console.warn(`[Orchestrator] ❌ Tool '${toolName}' is NOT in enabled_tools list: [${config.enabled_tools.join(', ')}]`);
        const errorMsg = 'Tool is not enabled';
        yield { type: 'tool_result' as const, tool: toolName, result: { error: errorMsg } };
        break;
      }

      // ── v3.1.0 Phase A.1.3: Validate tool args before dispatch ─────────────
      const validation = validateToolCall(toolName, toolArgs);
      if (!validation.valid) {
        console.warn(`[Orchestrator] ⚠️  Tool validation failed (${toolName}): ${validation.error}`);

        // Feed the error back as a tool_result so the LLM can self-correct
        loopMessages.push({
          role: 'assistant',
          content: [
            { type: 'text', text: assistantTextThisRound },
            { type: 'tool_use', id: toolId, name: toolName, input: toolArgs },
          ],
        });
        loopMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolId,
              content: `[VALIDATION ERROR] ${validation.error}`,
              is_error: true,
            },
          ],
        });

        yield { type: 'tool_result' as const, tool: toolName, result: { error: validation.error } };

        // Log the validation failure
        try {
          await db.from('ai_tool_call_logs').insert({
            session_id: sessionId,
            tool_name: toolName,
            http_method: 'GET',
            endpoint: toolName,
            request_params: toolArgs,
            response_status: 422,
            response_summary: { validation_error: validation.error },
            cache_hit: false,
            duration_ms: 0,
          } as any);
        } catch { /* non-critical */ }

        // Do NOT break — continue the loop so the LLM gets a chance to retry
        continue;
      }

      const start = Date.now();
      let result: any = null;
      let status = 200;

      try {
        if (toolName === 'search_knowledge_base') {
          // v3.1.0 Phase B.1.2: Check dedup cache before running retrieval
          const dedupHit = await ragDedupCache.checkDuplicate(sessionId, String(toolArgs?.query ?? ''));
          if (dedupHit) {
            // Return cached result — no embedding call, no DB query, ~2,000 tokens saved
            result = dedupHit;
            console.log(`[Orchestrator] ✅ RAG dedup cache hit for search_knowledge_base — skipped live retrieval`);
          } else {
            result = await searchKnowledgeBaseTool(String(toolArgs?.query ?? ''));
          }
        } else {
          result = await executeTool(toolName, toolArgs, { sessionId });
        }
        const resultSummary = typeof result === 'string'
          ? result.slice(0, 200)
          : JSON.stringify(result).slice(0, 200);
        console.log(`[Orchestrator] ✅ Tool result (${toolName}): ${resultSummary}...`);
      } catch (err: any) {
        result = { error: String(err?.message ?? err) };
        status = 500;
        console.error(`[Orchestrator] ❌ Tool error (${toolName}):`, err?.message ?? err);
        metrics.increment('tool-errors');
        metrics.logEvent('error', 'tool-execution-failed', { sessionId, toolName, error: String(err?.message ?? err) });
      }

      const duration = Date.now() - start;

      // Log tool call
      let logId: string | undefined;
      try {
        const { data: log } = await db.from('ai_tool_call_logs').insert({
          session_id: sessionId,
          tool_name: toolName,
          http_method: 'GET',
          endpoint: toolName,
          request_params: toolArgs,
          response_status: status,
          response_summary: result && typeof result === 'object' ? result : { value: String(result) },
          cache_hit: false,
          duration_ms: duration,
        } as any).select().single() as any;
        logId = log?.id;
      } catch (e) {
        console.error('[Orchestrator] failed to log tool call:', e);
      }

      toolCalls.push({ name: toolName, params: toolArgs, result, logId });

      // Yield tool_result
      yield { type: 'tool_result' as const, tool: toolName, result };

      // Append assistant's tool use and the user's tool result to messages history for next LLM turn
      loopMessages.push({
        role: 'assistant',
        content: [
          { type: 'text', text: assistantTextThisRound },
          {
            type: 'tool_use',
            id: toolId,
            name: toolName,
            input: toolArgs,
          },
        ],
      });

      loopMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolId,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      });
    } else {
      // No tool calls this round, conversation turn is complete
      break;
    }
  }

  // Persist assistant final message
  const finalMessage = finalMessageText || (
    retrieval.context && retrieval.context !== 'No relevant information found in the knowledge base.'
      ? `According to our knowledge:\n${retrieval.context}\n\nIf you need more details, I can check live availability or vouchers for you.`
      : "I don't have that information in our knowledge base. I can check live availability or look up vouchers if you'd like."
  );

  // v3.1.0 Phase C.4: Hallucination check on the final assembled response
  const hallucinationCheck = detectHallucinations(
    finalMessage,
    toolCalls.map((t) => ({ tool: t.name, data: t.result })),
    retrieval.context
  );
  if (!hallucinationCheck.safe) {
    console.warn('[Orchestrator] ⚠️  Hallucination warnings detected:');
    hallucinationCheck.warnings.forEach((w) => console.warn(`  • ${w}`));
  }

  const turnLatency = Date.now() - turnStart;

  logger.info('Orchestrator turn complete', {
    sessionId,
    latencyMs:   turnLatency,
    tokensIn:    totalInputTokens,
    tokensOut:   totalOutputTokens,
    toolsCalled: toolCalls.map((t) => t.name),
    ragSources:  retrieval.sources.length,
    hallucinationSafe: hallucinationCheck.safe,
  });

  // v3.1.0 Phase E.1: record metrics
  metrics.increment('requests-success');
  metrics.recordLatency('orchestrate-stream', turnLatency);
  if (totalInputTokens || totalOutputTokens) {
    // Determine which provider was used (Groq unless fallback triggered)
    const firstGroqKey = (env.GROK_API_KEYS ?? '').split(',')[0]?.trim() ?? '';
    const groqIsReal = firstGroqKey.length > 0 && !/dummy|placeholder|example|test/i.test(firstGroqKey) && !firstGroqKey.startsWith('sk-ant-dummy-');
    const provider = groqIsReal ? 'groq' : 'anthropic';
    metrics.recordTokenUsage(provider, totalInputTokens, totalOutputTokens);
  }
  if (!hallucinationCheck.safe) {
    metrics.increment('hallucination-events');
    metrics.logEvent('hallucination', 'detected', {
      sessionId,
      warnings: hallucinationCheck.warnings,
    });
  }

  await db.from('ai_chat_messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content: finalMessage,
    tool_calls: toolCalls.map((t) => ({ name: t.name, logId: t.logId })),
    tool_results: toolCalls.map((t) => t.result),
    tokens_in: totalInputTokens || null,
    tokens_out: totalOutputTokens || null,
    latency_ms: turnLatency,
  } as any);

  await (db.from('ai_chat_sessions') as any).update({ last_message_at: new Date().toISOString() }).eq('id', sessionId);

  // Trigger background summarization
  await maybeEnqueueSummarization(sessionId);

  yield { type: 'done' as const, message: finalMessage, sources: retrieval.sources };
}

/**
 * Standard processMessage helper for non-streaming clients.
 */
export async function processMessage(sessionId: string, userText: string, userContext?: UserContext) {
  let finalMessage = '';
  let sources: any[] = [];
  
  const stream = processMessageStream(sessionId, userText, userContext);
  for await (const event of stream) {
    if (event.type === 'done') {
      finalMessage = event.message;
      sources = event.sources || [];
    }
  }
  
  return { message: finalMessage, sources };
}

export default { processMessage, processMessageStream };
