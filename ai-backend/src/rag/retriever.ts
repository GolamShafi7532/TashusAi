/**
 * RAG Retriever — semantic search across KB entries and document chunks.
 *
 * Priority order (blueprint §3.3):
 *  1. ai_knowledge_base hits above threshold 0.60 → [AUTHORITATIVE — ADMIN OVERRIDE]
 *  2. ai_document_chunks hits above threshold 0.50 → [SOURCE: title, p.N]
 *  Combined context capped at ~2000 tokens before handing to LLM.
 *
 * Fallback: When mock embeddings are active (no real API key), falls back to
 * keyword-based SQL ILIKE search so RAG works in development too.
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import { db } from '@/db/client';
import { getEmbeddingProvider, MockEmbeddingProvider } from './embedding-provider';
import { estimateTokens } from './chunker';

// v3.1.0 thresholds were raised too aggressively (0.75 / 0.65).
// Reverted to the original validated values that were proven to return
// reliable results with real semantic embeddings.
const KB_SIMILARITY_THRESHOLD = 0.60;      // Validated: catches policy/FAQ hits reliably
const CHUNK_SIMILARITY_THRESHOLD = 0.50;   // Validated: filters out noise while keeping relevant chunks
const KB_LIMIT = 4;
const CHUNK_LIMIT = 4;
const MAX_CONTEXT_TOKENS = 2000;

// ── Public result type ─────────────────────────────────────────────────────────

export interface RetrievalResult {
  /** Formatted context string to inject into the LLM prompt */
  context: string;
  /** Individual sources for transparency/citation */
  sources: RetrievalSource[];
}

export interface RetrievalSource {
  type: 'kb' | 'document';
  content: string;
  label: string;       // e.g. "[AUTHORITATIVE]" or "[SOURCE: FAQ.pdf, p.3]"
  similarity?: number;
}

// ── Main retrieval function ────────────────────────────────────────────────────

export async function retrieve(query: string): Promise<RetrievalResult> {
  const emptyResult: RetrievalResult = {
    context: 'No relevant information found in the knowledge base.',
    sources: [],
  };

  // ── Detect if we are running with mock embeddings ────────────────────────────
  // Mock embeddings produce random vectors incompatible with real stored embeddings.
  // When active, fall back to keyword-based SQL search so RAG still works in dev.
  const provider = getEmbeddingProvider();
  const isMock = provider instanceof MockEmbeddingProvider;

  if (isMock) {
    console.log('[Retriever] ⚠️  Mock embeddings active — using keyword fallback search');
    return retrieveByKeyword(query);
  }

  // ── Semantic vector search (real embeddings) ─────────────────────────────────
  let queryEmbedding: number[];
  try {
    const embeddings = await provider.embed([query]);
    queryEmbedding = embeddings[0];
  } catch (embErr: any) {
    console.warn('[Retriever] Embedding failed — falling back to keyword search:', embErr?.message ?? embErr);
    return retrieveByKeyword(query);
  }

  // Run both vector searches in parallel
  const [kbResults, chunkResults] = await Promise.all([
    searchKnowledgeBase(queryEmbedding),
    searchDocumentChunks(queryEmbedding),
  ]);

  console.log(`[Retriever] Vector search: ${kbResults.length} KB hits, ${chunkResults.length} chunk hits`);
  kbResults.forEach((kb, i) => console.log(`[Retriever]   KB[${i}] similarity=${kb.similarity?.toFixed(3)} Q="${(kb.question ?? kb.answer).slice(0, 60)}"`) );

  // Merge: KB entries that meet the threshold go first (authoritative)
  const sources: RetrievalSource[] = [];
  let totalTokens = 0;

  for (const kb of kbResults) {
    if (totalTokens >= MAX_CONTEXT_TOKENS) break;
    const label = '[AUTHORITATIVE — ADMIN OVERRIDE]';
    const content = kb.question
      ? `Q: ${kb.question}\nA: ${kb.answer}`
      : kb.answer;
    const tagged = `${label}\n${content}`;
    totalTokens += estimateTokens(tagged);
    if (totalTokens <= MAX_CONTEXT_TOKENS) {
      sources.push({ type: 'kb', content: tagged, label, similarity: kb.similarity });
    }
  }

  for (const chunk of chunkResults) {
    if (totalTokens >= MAX_CONTEXT_TOKENS) break;
    const label = `[SOURCE: ${chunk.documentTitle}, p.${chunk.pageNumber ?? '?'}]`;
    const tagged = `${label}\n${chunk.content}`;
    totalTokens += estimateTokens(tagged);
    if (totalTokens <= MAX_CONTEXT_TOKENS) {
      sources.push({ type: 'document', content: tagged, label });
    }
  }

  // If vector search found nothing, attempt keyword fallback before giving up
  if (sources.length === 0) {
    console.log('[Retriever] Vector search returned 0 results — trying keyword fallback');
    return retrieveByKeyword(query);
  }

  const context = sources.map((s) => s.content).join('\n\n---\n\n');
  return { context, sources };
}

// ── Keyword fallback search (SQL ILIKE) ────────────────────────────────────────
// Used when mock embeddings are active or when vector search returns nothing.
// Searches question AND answer columns for any word in the query.

async function retrieveByKeyword(query: string): Promise<RetrievalResult> {
  const emptyResult: RetrievalResult = {
    context: 'No relevant information found in the knowledge base.',
    sources: [],
  };

  // Build search terms: take meaningful words (3+ chars) from the query
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);

  if (terms.length === 0) return emptyResult;

  // Build OR filter: any term matching question or answer
  const orFilters = terms.flatMap((term) => [
    `question.ilike.%${term}%`,
    `answer.ilike.%${term}%`,
  ]);

  try {
    const { data: kbRows, error: kbErr } = await (db.from('ai_knowledge_base') as any)
      .select('id, question, answer, priority')
      .or(orFilters.join(','))
      .eq('is_active', true)
      .limit(KB_LIMIT);

    if (kbErr) {
      console.error('[Retriever] Keyword KB search error:', kbErr.message);
    }

    const sources: RetrievalSource[] = [];
    let totalTokens = 0;

    for (const kb of (kbRows ?? [])) {
      if (totalTokens >= MAX_CONTEXT_TOKENS) break;
      const label = '[AUTHORITATIVE — ADMIN OVERRIDE]';
      const content = kb.question ? `Q: ${kb.question}\nA: ${kb.answer}` : kb.answer;
      const tagged = `${label}\n${content}`;
      totalTokens += estimateTokens(tagged);
      if (totalTokens <= MAX_CONTEXT_TOKENS) {
        sources.push({ type: 'kb', content: tagged, label });
      }
    }

    // Also search document chunks by keyword — join documents to get title
    const chunkOrFilters = terms.map((term) => `content.ilike.%${term}%`);
    const { data: chunkRows, error: chunkErr } = await (db.from('ai_document_chunks') as any)
      .select('id, content, page_number, ai_documents(title)')
      .or(chunkOrFilters.join(','))
      .eq('ai_documents.is_active', true)
      .limit(CHUNK_LIMIT);

    if (chunkErr) {
      console.error('[Retriever] Keyword chunk search error:', chunkErr.message);
    }

    for (const chunk of (chunkRows ?? [])) {
      if (totalTokens >= MAX_CONTEXT_TOKENS) break;
      const docTitle = (chunk as any).ai_documents?.title ?? 'Document';
      const label = `[SOURCE: ${docTitle}, p.${chunk.page_number ?? '?'}]`;
      const tagged = `${label}\n${chunk.content}`;
      totalTokens += estimateTokens(tagged);
      if (totalTokens <= MAX_CONTEXT_TOKENS) {
        sources.push({ type: 'document', content: tagged, label });
      }
    }

    console.log(`[Retriever] Keyword fallback: ${sources.length} total sources found for terms: [${terms.join(', ')}]`);

    if (sources.length === 0) return emptyResult;

    const context = sources.map((s) => s.content).join('\n\n---\n\n');
    return { context, sources };
  } catch (err: any) {
    console.error('[Retriever] Keyword fallback failed:', err?.message ?? err);
    return emptyResult;
  }
}

export async function searchKnowledgeBaseTool(query: string): Promise<string> {
  const result = await retrieve(query);
  const sourceLabels = result.sources.map((source) => source.label).join(', ');

  if (result.sources.length === 0) {
    return `${result.context}\n\nSources: none`;
  }

  return `${result.context}\n\nSources:\n${sourceLabels}`;
}

// ── KB pgvector similarity search ─────────────────────────────────────────────

interface KBHit {
  id: string;
  question: string | null;
  answer: string;
  priority: number;
  similarity: number;
}

async function searchKnowledgeBase(embedding: number[]): Promise<KBHit[]> {
  // pgvector cosine distance via raw RPC
  // <=> is the cosine distance operator; similarity = 1 - distance
  const { data, error } = (await db.rpc('search_knowledge_base', {
    query_embedding: embedding,
    similarity_threshold: KB_SIMILARITY_THRESHOLD,
    match_count: KB_LIMIT,
  } as any)) as any;

  if (error) {
    console.error('[Retriever] KB search error:', error.message);
    return [];
  }

  return (data ?? []) as KBHit[];
}

// ── Document chunk pgvector similarity search ──────────────────────────────────

interface ChunkHit {
  id: string;
  content: string;
  pageNumber: number | null;
  documentTitle: string;
  documentCategory: string;
}

async function searchDocumentChunks(embedding: number[]): Promise<ChunkHit[]> {
  const { data, error } = (await db.rpc('search_document_chunks', {
    query_embedding: embedding,
    match_count: CHUNK_LIMIT,
  } as any)) as any;

  if (error) {
    console.error('[Retriever] Chunk search error:', error.message);
    return [];
  }

  // Filter by similarity threshold to avoid injecting irrelevant PDF sections
  const hits = (data ?? []) as (ChunkHit & { similarity?: number })[];
  return hits.filter((h) => h.similarity == null || h.similarity >= CHUNK_SIMILARITY_THRESHOLD);
}
