import { NextResponse } from 'next/server';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';
import { processMessageStream } from '@/agent/orchestrator';
import { getRedisSubscriber, buildSessionControlChannel, redis } from '@/lib/redis';
import { isRateLimited } from '@/lib/rate-limiter';

export interface UserContext {
  timezone: string;       // IANA tz name, e.g. "Australia/Sydney"
  localTime: string;      // ISO UTC string of the user's current moment
  timezoneOffset: number; // getTimezoneOffset() value, e.g. -600 for UTC+10
}

type StreamBody = {
  sessionId: string;
  text: string;
  message?: string;       // widget sends "message", not "text"
  userContext?: UserContext;
};

function resolveAllowedOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return '*';
  const raw = process.env.WIDGET_ALLOWED_ORIGINS ?? '*';
  if (raw.trim() === '*') return requestOrigin;

  const allowed = new Set(
    raw.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
  );
  return allowed.has(requestOrigin.toLowerCase()) ? requestOrigin : 'null';
}

function sseHeaders(requestOrigin: string | null) {
  const origin = resolveAllowedOrigin(requestOrigin);
  return new Headers({
    // ── SSE ────────────────────────────────────────────────────────────────
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // ── CORS ───────────────────────────────────────────────────────────────
    // Must be set directly on the streaming response — middleware cannot
    // patch headers on a ReadableStream response after the fact.
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Type, X-Session-Id',
    'Vary': 'Origin',
  });
}

function encodeEvent(event: string, data: any) {
  return `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
}

export async function OPTIONS(req: Request) {
  // Safety-net preflight handler — the middleware handles this first, but
  // some Next.js edge-runtime configs may bypass middleware for streaming routes.
  const origin = resolveAllowedOrigin(req.headers.get('origin'));
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': origin === '*' ? 'false' : 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Visitor-Id',
      'Access-Control-Max-Age': '7200',
      'Vary': 'Origin',
    },
  });
}

export async function POST(req: Request) {
  const requestOrigin = req.headers.get('origin');
  const body = await req.json().catch(() => ({})) as Partial<StreamBody>;
  const sessionId = body.sessionId;
  // Widget sends "message" field; non-streaming route uses "text" — accept both
  const text = body.message ?? body.text;
  const userContext = body.userContext;

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
          console.warn('[AI Backend Stream] ⚠️ Request rejected: text/message is required');
          ctrl.enqueue(new TextEncoder().encode(encodeEvent('error', { message: 'text required', error: 'text required' })));
          cleanup();
          return;
        }

        console.log(`[AI Backend Stream] 🚀 Starting LLM orchestrator stream for session: ${sessionId}, prompt: "${text.substring(0, 50)}..."`);
        const orchestratorStream = processMessageStream(sessionId, text, userContext);
        for await (const event of orchestratorStream) {
          if (isPaused || isClosed) {
            console.log('[AI Backend Stream] Stream halted (paused or closed)');
            break;
          }

          if (event.type === 'token') {
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('token', { text: event.text, token: event.text, delta: event.text })));
          } else if (event.type === 'tool_start') {
            console.log(`[AI Backend Stream] 🛠️ Tool start: ${event.tool}`);
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_start', { tool: event.tool, input: event.input })));
          } else if (event.type === 'tool_result') {
            console.log(`[AI Backend Stream] ✅ Tool result: ${event.tool}`);
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('tool_result', { tool: event.tool, result: event.result })));
          } else if (event.type === 'done') {
            console.log(`[AI Backend Stream] 🎉 Turn done for session ${sessionId}`);
            ctrl.enqueue(new TextEncoder().encode(encodeEvent('done', { message: event.message, text: event.message, sources: event.sources })));
          }
        }

        // If turn completes normally and we aren't paused, clean up
        if (!isPaused) {
          cleanup();
        }
      } catch (err: any) {
        console.error('[AI Backend Stream] ❌ Orchestrator streaming error:', err);
        ctrl.enqueue(new TextEncoder().encode(encodeEvent('error', { message: err?.message ?? 'Internal error', error: err?.message ?? 'Internal error' })));
        cleanup();
      }
    },
    cancel() {
      // Handled by abort event listener
    }
  });

  return new NextResponse(controller, { status: 200, headers: sseHeaders(requestOrigin) });
}
