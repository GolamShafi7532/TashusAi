import { NextResponse } from 'next/server';
import { getBucketStatus } from '@/agent/token-bucket';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/token-bucket/status
 *
 * Returns real-time token bucket state: which keys are available,
 * which are cooling down, and for how long.
 *
 * Response: { keys: KeyStatus[], availableCount, totalKeys, allCoolingDown, nextAvailableIn }
 */
export async function GET() {
  try {
    const status = await getBucketStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    console.error('[TokenBucketStatusRoute]', err);
    return NextResponse.json({ error: 'Failed to get bucket status' }, { status: 500 });
  }
}
