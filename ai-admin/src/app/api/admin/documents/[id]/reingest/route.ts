import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';
import { enqueueIngestDocument } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/documents/[id]/reingest
 * Re-trigger document parsing, chunking, and embedding.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Authenticate
    const token = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_access_token='))
      ?.split('=')[1];

    const admin = token ? await verifyJwt(token) : null;
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Load document record
    const { data: document } = await db
      .from('ai_documents')
      .select('*')
      .eq('id', id)
      .limit(1)
      .single() as any;

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 3. Reset status and error message
    const { error: resetErr } = await (db.from('ai_documents') as any)
      .update({
        status: 'pending',
        error_message: null,
      } as any)
      .eq('id', id);

    if (resetErr) {
      console.error('[ReingestRoute] Failed to reset status:', resetErr.message);
      return NextResponse.json({ error: 'Failed to reset document status' }, { status: 500 });
    }

    // 4. Trigger inline ingestion on the backend
    const backendUrl = process.env.AI_BACKEND_URL || process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3001';
    try {
      const ingestRes = await fetch(`${backendUrl}/api/ai/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id }),
        signal: AbortSignal.timeout(120_000), // 2 minute timeout
      });

      if (!ingestRes.ok) {
        const ingestData = await ingestRes.json().catch(() => ({}));
        throw new Error(ingestData.error ?? 'Ingestion failed');
      }
    } catch (ingestErr: any) {
      console.warn('[ReingestRoute] Inline ingestion failed, falling back to queue:', ingestErr.message);
      try {
        await enqueueIngestDocument(id);
      } catch (qErr: any) {
        console.error('[ReingestRoute] Queue fallback also failed:', qErr.message);
        return NextResponse.json({ error: `Ingestion failed: ${ingestErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ReingestRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
