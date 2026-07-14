import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { processMessageStream } from '@/agent/orchestrator';
import { getRedisSubscriber, buildSessionControlChannel, redis } from '@/lib/redis';
import { isRateLimited } from '@/lib/rate-limiter';

type StreamBody = {
  sessionId: string;
  text: string;
};

function sseHeaders() {
  return new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
}

function encodeEvent(event: string, data: any) {
  return `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Partial<StreamBody>;
  const sessionId = body.sessionId;
  const text = body.text;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // 1. Load the session
  const { data: session, error: sessionErr } = await db
    .from('ai_chat_sessions')
    .select('id,is_ai_paused,visitor_id')
    .eq('id', sessionId)
    .single() as any;

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // 2. Enforce Redis Rate Limiting (COST-01)
  const rateLimit = await isRateLimited(session.visitor_id || 'unknown');
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter || 60),
        },
      }
    );
  }

  const subscriber = getRedisSubscriber();
  const channel = buildSessionControlChannel(sessionId);

  let isPaused = session.is_ai_paused;
  let isClosed = false;

  const controller = new ReadableStream({
    async start(ctrl) {
      // Send initial meta event
      ctrl.enqueue(new TextEncoder().encode(encodeEvent('meta', { sessionId })));

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        subscriber.off('message', onMessage);
        subscriber.unsubscribe(channel).catch(() => {});
        try {
          ctrl.close();
        } catch {}
      };

      const onMessage = (chan: string, msgStr: string) => {
        if (chan !== channel) return;
        try {
          const data = JSON.parse(msgStr);
          if (data.paused === true) {
            isPaused = true;
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('paused', {})));
          } else if (data.paused === false) {
            isPaused = false;
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('released', {})));
            cleanup();
          } else if (data.type === 'message') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('admin_message', data.message)));
          }
        } catch (e) {
          console.error('[StreamRoute] Failed to parse Redis control message:', e);
        }
      };

      // Subscribe to control channel
      await subscriber.subscribe(channel);
      subscriber.on('message', onMessage);

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        cleanup();
      });

      // ── Handoff Mode ────────────────────────────────────────────────────────
      if (isPaused) {
        // Yield paused event immediately
        ctrl.enqueue(new TextEncoder().encode(encodeEvent('paused', {})));

        // Persist user's message if present
        if (text) {
          try {
            await db.from('ai_chat_messages').insert({
              session_id: sessionId,
              role: 'user',
              content: text,
            } as any);

            // Notify admin listeners
            await redis.publish(`admin:session:${sessionId}:events`, JSON.stringify({
              type: 'user_message',
              message: { role: 'user', content: text, created_at: new Date().toISOString() }
            }));
          } catch (e) {
            console.error('[StreamRoute] Failed to persist user message in paused state:', e);
          }
        }

        // The connection remains open to relay admin messages via Redis Pub/Sub.
        // It will close when the client aborts or if the session is released.
        return;
      }

      // ── AI Active Mode ──────────────────────────────────────────────────────
      try {
        if (!text) {
          ctrl.enqueue(new TextEncoder().encode(encodeEvent('error', { error: 'text required' })));
          cleanup();
          return;
        }

        const orchestratorStream = processMessageStream(sessionId, text);
        for await (const event of orchestratorStream) {
          if (isPaused || isClosed) {
            break;
          }

          if (event.type === 'token') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('token', { token: event.text, delta: event.text })));
          } else if (event.type === 'tool_start') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_start', { tool: event.tool, input: event.input })));
          } else if (event.type === 'tool_result') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_result', { tool: event.tool, result: event.result })));
          } else if (event.type === 'done') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('done', { message: event.message, sources: event.sources })));
          }
        }

        // If turn completes normally and we aren't paused, clean up
        if (!isPaused) {
          cleanup();
        }
      } catch (err: any) {
        console.error('[StreamRoute] Orchestrator streaming error:', err);
        ctrl.enqueue(new TextEncoder().encode(encodeEvent('error', { error: err?.message ?? 'Internal error' })));
        cleanup();
      }
    },
    cancel() {
      // Handled by abort event listener
    }
  });

  return new NextResponse(controller, { status: 200, headers: sseHeaders() });
}
