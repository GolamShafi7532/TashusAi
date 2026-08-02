/**
 * Test session messages endpoint.
 * GET: Retrieve message history for a test session (stored in Redis with 1-hour TTL)
 * DELETE: Clear test session history
 */
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';


export async function GET(req: Request) {
  const url = new URL(req.url);
  const testSessionId = url.searchParams.get('testSessionId');

  if (!testSessionId) {
    return NextResponse.json({ error: 'testSessionId required' }, { 
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    // Check if test session exists
    const exists = await redis.exists(`test_session:${testSessionId}`);
    if (!exists) {
      return NextResponse.json({ error: 'Test session not found or expired' }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    // Retrieve messages (stored as JSON strings in a Redis list)
    const messagesKey = `test_messages:${testSessionId}`;
    const messageStrings = await redis.lrange(messagesKey, 0, -1) as string[];

    // Parse and reverse to get chronological order
    const messages = messageStrings
      .map(str => {
        try {
          return JSON.parse(str);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    return NextResponse.json({
      testSessionId,
      messages,
      count: messages.length,
      expiresInSeconds: await redis.ttl(messagesKey),
    }, { 
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (err: any) {
    console.error('[TestMessagesRoute GET] Error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const testSessionId = url.searchParams.get('testSessionId');

  if (!testSessionId) {
    return NextResponse.json({ error: 'testSessionId required' }, { 
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    // Delete both the session marker and messages
    const messagesKey = `test_messages:${testSessionId}`;
    await Promise.all([
      redis.del(`test_session:${testSessionId}`),
      redis.del(messagesKey),
    ]);

    return NextResponse.json({ 
      testSessionId, 
      cleared: true 
    }, { 
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (err: any) {
    console.error('[TestMessagesRoute DELETE] Error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: new Headers({
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }),
  });
}
