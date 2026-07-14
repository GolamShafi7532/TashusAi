/**
 * POST /api/ai/ingest
 * 
 * Inline document ingestion endpoint. Processes a PDF document through the
 * full RAG pipeline: parse → chunk → embed → store. This replaces the need
 * for a separate BullMQ worker process during development.
 *
 * Called by the admin panel after uploading a PDF to Supabase Storage.
 *
 * Body: { documentId: string }
 * Returns: { success: true, chunkCount, pageCount } or { error: string }
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getEmbeddingProvider } from '@/rag/embedding-provider';
import { chunkPages, type RawPage } from '@/rag/chunker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for large PDFs

const EMBED_BATCH_SIZE = 64;

export async function POST(req: Request) {
  let documentId: string;

  try {
    const body = await req.json();
    documentId = body.documentId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
  }

  console.log(`[IngestAPI] Starting inline ingestion for document: ${documentId}`);

  try {
    // ── 1. Load document record ───────────────────────────────────────────────
    const { data: doc, error: fetchError } = (await db
      .from('ai_documents')
      .select('*')
      .eq('id', documentId)
      .single()) as any;

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: `Document ${documentId} not found: ${fetchError?.message}` },
        { status: 404 }
      );
    }

    if (!doc.is_active) {
      return NextResponse.json(
        { error: `Document ${documentId} is inactive, skipping` },
        { status: 400 }
      );
    }

    // ── 2. Set status → parsing ───────────────────────────────────────────────
    await setDocumentStatus(documentId, 'parsing');

    // ── 3. Download PDF from Supabase Storage ─────────────────────────────────
    const { data: fileData, error: downloadError } = (await db.storage
      .from('ai-documents')
      .download(doc.storage_path)) as any;

    if (downloadError || !fileData) {
      await setDocumentStatus(documentId, 'failed', `Storage download failed: ${downloadError?.message}`);
      return NextResponse.json(
        { error: `Failed to download PDF: ${downloadError?.message}` },
        { status: 500 }
      );
    }

    // ── 4. Extract text per page using pdf-parse ──────────────────────────────
    let rawPages: RawPage[];
    try {
      const pdfBuffer = Buffer.from(await fileData.arrayBuffer());
      rawPages = await extractPdfPages(pdfBuffer);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      await setDocumentStatus(documentId, 'failed', `PDF parsing failed: ${msg}`);
      return NextResponse.json({ error: `PDF parsing failed: ${msg}` }, { status: 500 });
    }

    // ── 5. Semantic chunking ───────────────────────────────────────────────────
    const chunks = chunkPages(rawPages);
    console.log(`[IngestAPI] ${documentId}: ${chunks.length} chunks from ${rawPages.length} pages`);

    if (chunks.length === 0) {
      await setDocumentStatus(documentId, 'failed', 'No text content extracted from PDF');
      return NextResponse.json(
        { error: 'No chunks produced — PDF may be image-only or empty' },
        { status: 400 }
      );
    }

    // ── 6. Set status → embedding ─────────────────────────────────────────────
    await setDocumentStatus(documentId, 'embedding');

    // ── 7. Delete existing chunks (re-ingest scenario) ────────────────────────
    await db.from('ai_document_chunks').delete().eq('document_id', documentId);

    // ── 8. Batch embed + insert ────────────────────────────────────────────────
    const provider = getEmbeddingProvider();
    const chunkTexts = chunks.map((c) => c.content);
    const totalBatches = Math.ceil(chunkTexts.length / EMBED_BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const start = batchIdx * EMBED_BATCH_SIZE;
      const batchTexts = chunkTexts.slice(start, start + EMBED_BATCH_SIZE);
      const batchChunks = chunks.slice(start, start + EMBED_BATCH_SIZE);

      const embeddings = await provider.embed(batchTexts);

      const rows = batchChunks.map((chunk, i) => ({
        document_id: documentId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        page_number: chunk.pageNumber,
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(embeddings[i]),
      }));

      const { error: insertError } = (await db
        .from('ai_document_chunks')
        .insert(rows as any)) as any;

      if (insertError) {
        await setDocumentStatus(documentId, 'failed', `Chunk insert failed: ${insertError.message}`);
        return NextResponse.json(
          { error: `Batch ${batchIdx} insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // ── 9. Mark document ready ────────────────────────────────────────────────
    await setDocumentStatus(documentId, 'ready');

    console.log(
      `[IngestAPI] ✅ Document ${documentId} ingested: ` +
        `${chunks.length} chunks, ${rawPages.length} pages`
    );

    return NextResponse.json({
      success: true,
      documentId,
      chunkCount: chunks.length,
      pageCount: rawPages.length,
    });
  } catch (err: any) {
    console.error(`[IngestAPI] ❌ Ingestion failed for ${documentId}:`, err);
    await setDocumentStatus(documentId, 'failed', err?.message ?? 'Unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Ingestion failed' },
      { status: 500 }
    );
  }
}

// ── PDF text extraction ────────────────────────────────────────────────────────

async function extractPdfPages(buffer: Buffer): Promise<RawPage[]> {
  const pdfParse = (await import('pdf-parse')).default;
  const pages: RawPage[] = [];

  await pdfParse(buffer, {
    pagerender: async (pageData: {
      getTextContent: () => Promise<{
        items: { str: string; transform: number[] }[];
      }>;
    }) => {
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      pages.push({ pageNumber: pages.length + 1, text: pageText });
      return pageText;
    },
  });

  // Fallback: if pagerender didn't populate pages, use full text
  if (pages.length === 0) {
    const result = await pdfParse(buffer);
    if (result.text) {
      pages.push({ pageNumber: 1, text: result.text });
    }
  }

  return pages;
}

// ── Status helper ─────────────────────────────────────────────────────────────

async function setDocumentStatus(
  documentId: string,
  status: 'parsing' | 'embedding' | 'ready' | 'failed',
  errorMessage?: string
): Promise<void> {
  await (db.from('ai_documents') as any)
    .update({
      status,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', documentId);
}
