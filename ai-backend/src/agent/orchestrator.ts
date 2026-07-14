/**
 * Agent orchestrator: persists user messages, loads config and memory,
 * calls the LLM with a rolling-window prompt, handles tool calls, and
 * enqueues background summarization when the conversation grows.
 *
 * Source of truth: AI Chatbot blueprint.md §3.4
 */
import { db, AiAgentConfig } from '@/db/client';
import { retrieve, searchKnowledgeBaseTool } from '@/rag/retriever';
import { generateCompletionStream } from '@/agent/llm';
import { executeTool, AGENT_TOOLS } from '@/agent/tools';
import { loadActiveAgentConfig } from '@/agent/config';
import { enqueueSummarizeSession } from '@/lib/queue';

type ConversationMessage = { role: string; content: string };

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
export async function* processMessageStream(sessionId: string, userText: string) {
  const turnStart = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Orchestrator] ► New message | session=${sessionId}`);
  console.log(`[Orchestrator] User: "${userText.slice(0, 120)}"`);
  console.log(`${'='.repeat(60)}`);

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
  } else if (ragNeeded) {
    console.log(`[Orchestrator]   No matching knowledge base entries (mock embeddings may be active)`);
  }

  // Prepare system prompt: merge system_prompt, summary, retrieval context
  const systemPrompt = [
    config.system_prompt.trim(),
    conversation.summary ? `Conversation summary so far:\n${conversation.summary}` : '',
    retrieval.context ? `Retrieved knowledge base content:\n${retrieval.context}` : '',
  ].filter(Boolean).join('\n\n');

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
      system: systemPrompt,
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

      const start = Date.now();
      let result: any = null;
      let status = 200;

      try {
        if (toolName === 'search_knowledge_base') {
          result = await searchKnowledgeBaseTool(String(toolArgs?.query ?? ''));
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

  const turnLatency = Date.now() - turnStart;

  console.log(`[Orchestrator] ✓ Done | latency=${turnLatency}ms, in=${totalInputTokens}tok, out=${totalOutputTokens}tok`);
  console.log(`[Orchestrator] Final message (${finalMessage.length} chars): "${finalMessage.slice(0, 150)}..."`);

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
export async function processMessage(sessionId: string, userText: string) {
  let finalMessage = '';
  let sources: any[] = [];
  
  const stream = processMessageStream(sessionId, userText);
  for await (const event of stream) {
    if (event.type === 'done') {
      finalMessage = event.message;
      sources = event.sources || [];
    }
  }
  
  return { message: finalMessage, sources };
}

export default { processMessage, processMessageStream };
