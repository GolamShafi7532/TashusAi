import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  const token = req.headers.get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

/**
 * GET /api/admin/documents
 * List all uploaded documents and ingestion status.
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: documents, error } = await (db.from('ai_documents') as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DocsRoute] DB Error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve documents' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents ?? [] });
  } catch (err: any) {
    console.error('[DocsRoute] GET Error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/documents
 * Upload PDF to Supabase Storage, insert ai_documents row, then trigger
 * inline ingestion on the backend (parse → chunk → embed → store).
 */
export async function POST(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const category = formData.get('category') as string | null;

    if (!title || !category) {
      return NextResponse.json({ error: 'Missing title or category' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 20MB limit' }, { status: 400 });
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF documents are supported' }, { status: 400 });
    }

    // 1. Insert document record (status=pending)
    const { data: document, error: insertErr } = await (db.from('ai_documents') as any)
      .insert({
        title,
        category,
        original_filename: file.name,
        storage_path: 'pending',
        mime_type: 'application/pdf',
        file_size_bytes: file.size,
        status: 'pending',
        uploaded_by: admin.userId,
        version: 1,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr || !document) {
      return NextResponse.json({ error: insertErr?.message ?? 'DB insert failed' }, { status: 500 });
    }

    // 2. Upload to Supabase Storage
    const storagePath = `${document.id}/${file.name}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await (db as any).storage
      .from('ai-documents')
      .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      await (db.from('ai_documents') as any).update({ status: 'failed', error_message: uploadErr.message }).eq('id', document.id);
      return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    // 3. Update storage_path in DB
    await (db.from('ai_documents') as any).update({ storage_path: storagePath }).eq('id', document.id);

    // 4. Trigger inline ingestion on the backend
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3001';
    try {
      const ingestRes = await fetch(`${backendUrl}/api/ai/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
        signal: AbortSignal.timeout(120_000), // 2 minute timeout for large PDFs
      });

      const ingestData = await ingestRes.json().catch(() => ({}));

      if (!ingestRes.ok) {
        console.error('[DocsRoute] Inline ingestion failed:', ingestData);
        // Don't fail the upload — the document is stored, ingestion can be retried
        return NextResponse.json({
          success: true,
          document,
          ingestion: { status: 'failed', error: ingestData.error ?? 'Ingestion failed' },
        });
      }

      return NextResponse.json({
        success: true,
        document: { ...document, status: 'ready' },
        ingestion: {
          status: 'ready',
          chunkCount: ingestData.chunkCount,
          pageCount: ingestData.pageCount,
        },
      });
    } catch (ingestErr: any) {
      console.error('[DocsRoute] Ingestion request failed:', ingestErr?.message);
      // Fallback: try BullMQ queue if available
      try {
        const { enqueueIngestDocument } = await import('@/lib/queue');
        await enqueueIngestDocument(document.id);
        return NextResponse.json({
          success: true,
          document,
          ingestion: { status: 'queued', note: 'Inline ingestion failed, queued for background processing' },
        });
      } catch {
        return NextResponse.json({
          success: true,
          document,
          ingestion: { status: 'pending', note: 'Ingestion not triggered — retry with Re-Ingest button' },
        });
      }
    }
  } catch (err: any) {
    console.error('[DocsRoute] POST Error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

