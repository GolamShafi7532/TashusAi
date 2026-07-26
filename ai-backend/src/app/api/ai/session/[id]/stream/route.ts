/**
 * GET /api/ai/session/[id]/stream
 * SSE stream for the chat widget.
 * Delivers admin messages, system state changes (handoff / AI resume)
 * in real-time via Redis Pub/Sub on channel `session:{id}:control`.
 */
import { NextRequest } from 'next/server';
import { buildSessionControlChannel } from '@/lib/redis';
import Redis from 'ioredis';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveAllowedOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return '*';
  const raw = process.env.WIDGET_ALLOWED_ORIGINS ?? '*';
  if (raw.trim() === '*') return requestOrigin;

  const allowed = new Set(
    raw.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
  );
  return allowed.has(requestOrigin.toLowerCase()) ? requestOrigin : 'null';
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const encoder = new TextEncoder();
  const channel = buildSessionControlChannel(sessionId);

  const requestOrigin = req.headers.get('origin');
  const origin = resolveAllowedOrigin(requestOrigin);

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      send('connected', { session_id: sessionId, ts: Date.now() });

      // Always create a fresh Redis connection per SSE request.
      // Sharing the singleton subscriber causes missed messages when it's
      // already subscribed to other channels or in an error state.
      const sub = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(100 * 2 ** times, 5000),
      });

      sub.on('error', (err) => {
        console.error(`[WidgetSSE] Redis error for session ${sessionId}:`, err.message);
      });

      try {
        await sub.subscribe(channel);
        sub.on('message', (_ch: string, raw: string) => {
          try {
            const payload = JSON.parse(raw);
            // Remap 'message' type to 'admin_message' at the server level.
            // 'message' is a reserved SSE event name — browsers route it to
            // onmessage instead of named listeners, causing inconsistent delivery.
            const eventName = payload.type === 'message' ? 'admin_message' : (payload.type ?? 'event');
            send(eventName, payload);
          } catch { /* malformed */ }
        });
      } catch (err) {
        console.error('[WidgetSSE] subscribe failed:', err);
      }

      const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 25000);

      req.signal.addEventListener('abort', () => {
        clearInterval(hb);
        try { sub.unsubscribe(channel); sub.quit(); } catch { /* ok */ }
        controller.close();
      });
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    },
  });
}
