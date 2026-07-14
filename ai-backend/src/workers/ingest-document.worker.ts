/**
 * PDF Ingestion Worker — BullMQ job processor.
 *
 * Pipeline (blueprint §3.3):
 *   status: pending → parsing → embedding → ready (or failed)
 *
 *  1. Download PDF from Supabase Storage
 *  2. Extract text per page via pdf-parse
 *  3. Semantic header-aware chunking (chunker.ts)
 *  4. Batch embed chunks (EmbeddingProvider, 64 at a time)
 *  5. Insert ai_document_chunks rows
 *  6. Mark document as 'ready'
 *
 * Retries: max 3 via BullMQ exponential backoff (2s, 4s, 8s).
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import type { Job } from 'bullmq';
import { createWorker, type IngestDocumentJobData, QUEUE_NAMES } from '@/lib/queue';
import { db } from '@/db/client';
import { getEmbeddingProvider } from '@/rag/embedding-provider';
import { chunkPages, type RawPage } from '@/rag/chunker';
import { env } from '@/lib/env';

const EMBED_BATCH_SIZE = 64;

// ── Worker processor ───────────────────────────────────────────────────────────

async function processIngestDocument(job: Job<IngestDocumentJobData>): Promise<void> {
  const { documentId } = job.data;
  console.log(`[IngestWorker] Starting job for document: ${documentId}`);

  // ── 1. Load document record ───────────────────────────────────────────────
  const { data: doc, error: fetchError } = (await db
    .from('ai_documents')
    .select('*')
    .eq('id', documentId)
    .single()) as any;

  if (fetchError || !doc) {
    throw new Error(`Document ${documentId} not found: ${fetchError?.message}`);
  }

  if (!doc.is_active) {
    console.log(`[IngestWorker] Document ${documentId} is inactive, skipping`);
    return;
  }

  // ── 2. Set status → parsing ───────────────────────────────────────────────
  await setDocumentStatus(documentId, 'parsing');
  await job.updateProgress(10);

  // ── 3. Download PDF from Supabase Storage ─────────────────────────────────
  const { data: fileData, error: downloadError } = (await db.storage
    .from('ai-documents')
    .download(doc.storage_path)) as any;

  if (downloadError || !fileData) {
    await setDocumentStatus(documentId, 'failed', `Storage download failed: ${downloadError?.message}`);
    throw new Error(`Failed to download ${doc.storage_path}: ${downloadError?.message}`);
  }

  await job.updateProgress(20);

  // ── 4. Extract text per page using pdf-parse ──────────────────────────────
  let rawPages: RawPage[];
  try {
    const pdfBuffer = Buffer.from(await fileData.arrayBuffer());
    rawPages = await extractPdfPages(pdfBuffer);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    await setDocumentStatus(documentId, 'failed', `PDF parsing failed: ${msg}`);
    throw new Error(`PDF parsing failed: ${msg}`);
  }

  await job.updateProgress(40);

  // ── 5. Semantic chunking ───────────────────────────────────────────────────
  const chunks = chunkPages(rawPages);
  console.log(`[IngestWorker] ${documentId}: ${chunks.length} chunks from ${rawPages.length} pages`);

  if (chunks.length === 0) {
    await setDocumentStatus(documentId, 'failed', 'No text content extracted from PDF');
    throw new Error('No chunks produced — PDF may be image-only or empty');
  }

  // ── 6. Set status → embedding ─────────────────────────────────────────────
  await setDocumentStatus(documentId, 'embedding');
  await job.updateProgress(50);

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
      embedding: JSON.stringify(embeddings[i]), // pgvector accepts JSON array
    }));

    const { error: insertError } = (await db.from('ai_document_chunks').insert(rows as any)) as any;
    if (insertError) {
      await setDocumentStatus(documentId, 'failed', `Chunk insert failed: ${insertError.message}`);
      throw new Error(`Batch ${batchIdx} insert failed: ${insertError.message}`);
    }

    // Update progress proportionally through the embedding phase (50→90%)
    const progress = 50 + Math.round(((batchIdx + 1) / totalBatches) * 40);
    await job.updateProgress(progress);
  }

  // ── 9. Mark document ready ────────────────────────────────────────────────
  await setDocumentStatus(documentId, 'ready');
  await job.updateProgress(100);

  console.log(
    `[IngestWorker] ✅ Document ${documentId} ingested: ` +
      `${chunks.length} chunks, ${rawPages.length} pages`
  );
}

// ── PDF text extraction ────────────────────────────────────────────────────────

async function extractPdfPages(buffer: Buffer): Promise<RawPage[]> {
  // Dynamic import — pdf-parse is a server-only dependency
  const pdfParse = (await import('pdf-parse')).default;

  const pages: RawPage[] = [];

  // pdf-parse renders all pages; we split by tracking page count
  const result = await pdfParse(buffer, {
    // Called for each page — allows per-page text capture
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

  // Fallback: if pagerender didn't populate pages (some PDFs), use full text
  if (pages.length === 0 && result.text) {
    pages.push({ pageNumber: 1, text: result.text });
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
    .update({ status, ...(errorMessage ? { error_message: errorMessage } : {}) } as any)
    .eq('id', documentId);
}

// ── Export worker factory call ─────────────────────────────────────────────────
// Called from src/workers/run-workers.ts — NOT from Next.js routes.

export function startIngestWorker() {
  return createWorker<IngestDocumentJobData>(
    QUEUE_NAMES.INGEST_DOCUMENT,
    processIngestDocument,
    2 // concurrency: process 2 documents at once
  );
}
