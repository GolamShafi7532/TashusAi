/**
 * GET /api/admin/notifications/stream
 * Server-Sent Events endpoint for real-time admin notifications.
 * Admins subscribe here to receive instant handoff alerts.
 */
import { NextRequest } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let subscriber: typeof redis | null = null;

      const send = (event: string, data: any) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          // Client disconnected
        }
      };

      // Send initial heartbeat
      send('connected', { message: 'Admin notification stream connected', timestamp: new Date().toISOString() });

      try {
        // Create a dedicated Redis subscriber (must be a separate connection)
        subscriber = (redis as any).duplicate ? (redis as any).duplicate() : redis;
        await (subscriber as any).subscribe('admin:notifications');

        (subscriber as any).on('message', (_channel: string, message: string) => {
          try {
            const data = JSON.parse(message);
            send(data.type || 'notification', data);
          } catch {
            // malformed message — skip
          }
        });

        // Heartbeat every 30s to keep connection alive
        const heartbeat = setInterval(() => {
          send('heartbeat', { timestamp: new Date().toISOString() });
        }, 30000);

        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          try {
            (subscriber as any)?.unsubscribe?.('admin:notifications');
            (subscriber as any)?.quit?.();
          } catch { /* clean up */ }
          controller.close();
        });

      } catch (err) {
        console.error('[SSE] Failed to set up subscriber:', err);
        // Fall back to polling mode — still send heartbeats
        const heartbeat = setInterval(() => {
          send('heartbeat', { timestamp: new Date().toISOString() });
        }, 5000);

        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          controller.close();
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
    },
  });
}
