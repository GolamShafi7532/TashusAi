/**
 * GET /api/admin/notifications/stream
 * SSE endpoint — admins subscribe for real-time handoff alerts and session updates.
 * Publishes over Redis channel `admin:notifications`.
 */
import { getRedisClient } from '@/lib/redis';
import { isLocalDevMode } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* client gone */ }
      };

      send('connected', { ts: Date.now() });

      // In local dev there is no real Redis — just send heartbeats
      if (isLocalDevMode()) {
        send('info', { message: 'Local dev mode — Redis pub/sub not available' });
        const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 10000);
        req.signal.addEventListener('abort', () => { clearInterval(hb); controller.close(); });
        return;
      }

      let subscriber: ReturnType<typeof getRedisClient> | null = null;
      try {
        // ioredis: duplicate() gives an independent connection for subscribe mode
        subscriber = (getRedisClient() as any).duplicate();
        await (subscriber as any).subscribe('admin:notifications');

        (subscriber as any).on('message', (_ch: string, raw: string) => {
          try {
            const payload = JSON.parse(raw);
            send(payload.type ?? 'notification', payload);
          } catch { /* malformed */ }
        });

        const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 25000);

        req.signal.addEventListener('abort', () => {
          clearInterval(hb);
          try { (subscriber as any)?.unsubscribe('admin:notifications'); (subscriber as any)?.quit(); } catch { /* ok */ }
          controller.close();
        });
      } catch (err) {
        console.error('[AdminSSE] subscriber setup failed:', err);
        // Degrade gracefully — heartbeats only
        const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 5000);
        req.signal.addEventListener('abort', () => { clearInterval(hb); controller.close(); });
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
