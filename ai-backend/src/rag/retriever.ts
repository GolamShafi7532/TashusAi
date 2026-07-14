/**
 * RAG Retriever — semantic search across KB entries and document chunks.
 *
 * Priority order (blueprint §3.3):
 *  1. ai_knowledge_base hits above threshold 0.75 → [AUTHORITATIVE — ADMIN OVERRIDE]
 *  2. ai_document_chunks hits → [SOURCE: title, p.N]
 *  Combined context capped at ~3000 tokens before handing to LLM.
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import { db } from '@/db/client';
import { getEmbeddingProvider } from './embedding-provider';
import { estimateTokens } from './chunker';

const KB_SIMILARITY_THRESHOLD = 0.60;
const CHUNK_SIMILARITY_THRESHOLD = 0.50; // Filter irrelevant document chunks
const KB_LIMIT = 4;
const CHUNK_LIMIT = 4; // Reduced from 8 → saves ~2,000 tokens per turn
const MAX_CONTEXT_TOKENS = 2000; // Tighter cap to stay well within Groq TPD limits

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

  let queryEmbedding: number[];
  try {
    const provider = getEmbeddingProvider();
    const embeddings = await provider.embed([query]);
    queryEmbedding = embeddings[0];
  } catch (embErr: any) {
    console.warn('[Retriever] Embedding failed — skipping RAG retrieval:', embErr?.message ?? embErr);
    return emptyResult;
  }

  // Run both searches in parallel
  const [kbResults, chunkResults] = await Promise.all([
    searchKnowledgeBase(queryEmbedding),
    searchDocumentChunks(queryEmbedding),
  ]);

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

  const context =
    sources.length > 0
      ? sources.map((s) => s.content).join('\n\n---\n\n')
      : 'No relevant information found in the knowledge base.';

  return { context, sources };
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
