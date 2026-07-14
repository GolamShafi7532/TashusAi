/**
 * Test mode streaming chat endpoint for admin testing console.
 * - No session persistence in main DB
 * - Ephemeral test session stored in Redis with 1-hour TTL
 * - Full orchestrator with tools, RAG, and streaming
 */
import { NextResponse } from 'next/server';
import { processMessageStream } from '@/agent/orchestrator';
import { redis } from '@/lib/redis';
import { randomUUID } from 'crypto';

type TestStreamBody = {
  message: string;
  testSessionId?: string;
};

function sseHeaders() {
  return new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
}

function encodeEvent(event: string, data: any) {
  return `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Partial<TestStreamBody>;
  const message = body.message?.trim();
  let testSessionId = body.testSessionId;

  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  // Generate ephemeral test session ID if not provided
  if (!testSessionId) {
    testSessionId = `test:${randomUUID()}`;
  }

  // Mark this session as a test session in Redis (1-hour TTL)
  await redis.setex(`test_session:${testSessionId}`, 3600, '1');

  // Store message history in Redis for this test session
  const messagesKey = `test_messages:${testSessionId}`;
  const userMessage = {
    id: randomUUID(),
    role: 'user',
    content: message,
    created_at: new Date().toISOString(),
  };

  await redis.lpush(messagesKey, JSON.stringify(userMessage));
  await redis.expire(messagesKey, 3600); // 1-hour TTL

  let assistantContent = '';
  let assistantMessageId = randomUUID();
  let toolCalls: any[] = [];
  let sources: any[] = [];

  const controller = new ReadableStream({
    async start(ctrl) {
      // Send initial meta event with test session ID
      ctrl.enqueue(new TextEncoder().encode(encodeEvent('meta', { testSessionId, isTestMode: true })));

      try {
        const orchestratorStream = processMessageStream(testSessionId, message);

        for await (const event of orchestratorStream) {
          if (event.type === 'token') {
            assistantContent += event.text;
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('token', { token: event.text, delta: event.text })));
          } else if (event.type === 'tool_start') {
            toolCalls.push({ tool: event.tool, input: event.input, status: 'running' });
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_start', { tool: event.tool, input: event.input })));
          } else if (event.type === 'tool_result') {
            // Update tool call with result
            const toolIndex = toolCalls.findIndex(t => t.tool === event.tool);
            if (toolIndex >= 0) {
              toolCalls[toolIndex].status = 'completed';
              toolCalls[toolIndex].result = event.result;
            }
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_result', { tool: event.tool, result: event.result })));
          } else if (event.type === 'done') {
            sources = event.sources || [];
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('done', { 
              message: event.message, 
              sources: event.sources,
              toolCalls,
            })));
          }
        }

        // Persist assistant message to test session history
        const assistantMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: assistantContent,
          tool_calls: toolCalls,
          sources,
          created_at: new Date().toISOString(),
        };

        await redis.lpush(messagesKey, JSON.stringify(assistantMessage));
        await redis.expire(messagesKey, 3600);

        try {
          ctrl.close();
        } catch {}
      } catch (err: any) {
        console.error('[TestStreamRoute] Orchestrator error:', err);
        ctrl.enqueue(new TextEncoder().encode(encodeEvent('error', { error: err?.message ?? 'Internal error' })));
        try {
          ctrl.close();
        } catch {}
      }
    },
    cancel() {
      // Client disconnected
    }
  });

  return new NextResponse(controller, { 
    status: 200, 
    headers: sseHeaders(),
  });
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: new Headers({
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }),
  });
}
