/**
 * Test context inspection endpoint.
 * Returns RAG retrieval results (KB entries + document chunks) for a query without calling LLM.
 * Useful for debugging and understanding what the AI sees for a given prompt.
 */
import { NextResponse } from 'next/server';
import { retrieve } from '@/rag/retriever';
import { getEmbeddingProvider } from '@/rag/embedding-provider';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';


type ContextBody = {
  message: string;
};

// Copied KB_SIMILARITY_THRESHOLD from retriever for consistency
const KB_SIMILARITY_THRESHOLD = 0.75;
const KB_LIMIT = 5;
const CHUNK_LIMIT = 8;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Partial<ContextBody>;
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const provider = getEmbeddingProvider();
    const [queryEmbedding] = await provider.embed([message]);

    // Run KB and document searches to provide detailed breakdown
    const kbResults = await db.rpc('search_knowledge_base', {
      query_embedding: queryEmbedding,
      similarity_threshold: KB_SIMILARITY_THRESHOLD,
      match_count: KB_LIMIT,
    } as any);

    const chunkResults = await db.rpc('search_document_chunks', {
      query_embedding: queryEmbedding,
      match_count: CHUNK_LIMIT,
    } as any);

    const kbData = (kbResults.data ?? []) as any[];
    const chunkData = (chunkResults.data ?? []) as any[];

    // Also get the merged retrieval result for the full context
    const { context, sources } = await retrieve(message);

    return NextResponse.json({
      query: message,
      kbEntries: kbData.map((kb: any) => ({
        id: kb.id,
        type: kb.entry_type,
        question: kb.question,
        answer: kb.answer,
        priority: kb.priority,
        tags: kb.tags,
        similarity: kb.similarity,
        isActive: kb.is_active,
        source: '[KB ENTRY]',
      })),
      documentChunks: chunkData.map((chunk: any) => ({
        id: chunk.id,
        documentTitle: chunk.documentTitle || chunk.document_title,
        pageNumber: chunk.pageNumber || chunk.page_number,
        content: chunk.content,
        similarity: chunk.similarity,
        source: `[DOC: ${chunk.documentTitle || chunk.document_title}, p.${chunk.pageNumber || chunk.page_number}]`,
      })),
      mergedContext: context,
      sources: sources,
      summary: {
        totalKBEntries: kbData.length,
        totalDocumentChunks: chunkData.length,
        topKBSimilarity: kbData.length > 0 ? kbData[0].similarity : null,
        topDocSimilarity: chunkData.length > 0 ? chunkData[0].similarity : null,
      }
    }, { 
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (err: any) {
    console.error('[TestContextRoute] Retrieval error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }),
  });
}
