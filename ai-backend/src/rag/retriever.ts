/**
 * RAG Retriever — semantic search across KB entries and document chunks.
 *
 * Priority order (blueprint §3.3):
 *  1. ai_knowledge_base hits above threshold 0.60 → [AUTHORITATIVE — ADMIN OVERRIDE]
 *  2. ai_document_chunks hits above threshold 0.50 → [SOURCE: title, Page N, §heading]
 *  Combined context capped at ~2000 tokens before handing to LLM.
 *
 * Chunk text is cleaned before injection:
 *  - HTML/markdown comments stripped (page markers, breadcrumbs)
 *  - Each chunk truncated to MAX_CHUNK_CHARS so the LLM synthesises, not pastes
 *  - Source label carries document title + page + section heading for 📋 citation
 *
 * Fallback: When mock embeddings are active (no real API key), falls back to
 * keyword-based SQL ILIKE search so RAG works in development too.
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import { db } from '@/db/client';
import { getEmbeddingProvider, MockEmbeddingProvider } from './embedding-provider';
import { estimateTokens } from './chunker';

const KB_SIMILARITY_THRESHOLD = 0.75;    // raised from 0.60 — calibrated for real OpenAI embeddings
const CHUNK_SIMILARITY_THRESHOLD = 0.65; // raised from 0.50 — filters noisy chunk matches
const KB_LIMIT = 4;
const CHUNK_LIMIT = 4;
const MAX_CONTEXT_TOKENS = 2000;

// Maximum characters kept from a single document chunk.
// Long legal paragraphs are truncated here — the LLM should summarise, not echo.
const MAX_CHUNK_CHARS = 600;

// ── Public result types ────────────────────────────────────────────────────────

export interface RetrievalResult {
  /** Formatted context string to inject into the LLM prompt */
  context: string;
  /** Individual sources for transparency / citation */
  sources: RetrievalSource[];
}

export interface RetrievalSource {
  type: 'kb' | 'document';
  content: string;
  label: string;
  similarity?: number;
}

// ── Text cleaning helpers ──────────────────────────────────────────────────────

/**
 * Clean raw document chunk text before sending to the LLM.
 *
 * Removes:
 *  - HTML comments injected by the chunker (<!-- page:1 -->, <!-- heading:... -->)
 *  - Markdown heading breadcrumb lines  (e.g. "# Section > Sub-heading")
 *  - Excess blank lines
 *
 * Then truncates to MAX_CHUNK_CHARS at the nearest sentence boundary so the LLM
 * receives a coherent passage rather than a wall of legal text.
 */
function cleanChunkText(raw: string): string {
  let text = raw
    .replace(/<!--.*?-->/gs, '')                    // strip HTML comments
    .replace(/^#+\s+.*?>\s+.*$/gm, '')              // strip breadcrumb heading lines
    .replace(/\n{3,}/g, '\n\n')                     // collapse excess blank lines
    .trim();

  if (text.length > MAX_CHUNK_CHARS) {
    const truncated = text.slice(0, MAX_CHUNK_CHARS);
    const lastPeriod = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('.\n'),
    );
    text = lastPeriod > MAX_CHUNK_CHARS * 0.6
      ? truncated.slice(0, lastPeriod + 1) + ' [...]'
      : truncated + ' [...]';
  }

  return text;
}

/**
 * Extract a section heading from the chunker's breadcrumb comment if present.
 * Example: <!-- heading: §7.2 Vehicle Care --> → "§7.2 Vehicle Care"
 */
function extractHeading(raw: string): string | null {
  const match = raw.match(/<!--\s*heading:\s*(.+?)\s*-->/i);
  return match ? match[1].trim() : null;
}

/**
 * Build the human-readable source label the LLM uses in the 📋 citation line.
 * Format: "Document Title, Page N, §Section" (omits missing parts gracefully).
 */
function buildSourceLabel(
  documentTitle: string,
  pageNumber: number | null,
  heading: string | null,
): string {
  const parts: string[] = [documentTitle];
  if (pageNumber) parts.push(`Page ${pageNumber}`);
  if (heading) parts.push(heading);
  return parts.join(', ');
}

/**
 * Format the merged sources into a structured context block the LLM can read clearly.
 * KB entries (authoritative) are separated from document passages (supporting evidence).
 */
function buildFormattedContext(sources: RetrievalSource[]): string {
  const kbEntries = sources.filter((s) => s.type === 'kb');
  const docChunks = sources.filter((s) => s.type === 'document');
  const parts: string[] = [];

  if (kbEntries.length > 0) {
    parts.push('=== OFFICIAL KB ANSWERS (use these as primary answer source) ===');
    parts.push(kbEntries.map((s) => s.content).join('\n\n'));
  }

  if (docChunks.length > 0) {
    parts.push('=== DOCUMENT PASSAGES (use for additional detail and citation) ===');
    parts.push(docChunks.map((s) => s.content).join('\n\n---\n\n'));
  }

  return parts.join('\n\n');
}

// ── Main retrieval function ────────────────────────────────────────────────────

export async function retrieve(query: string): Promise<RetrievalResult> {
  const emptyResult: RetrievalResult = {
    context: 'No relevant information found in the knowledge base.',
    sources: [],
  };

  const provider = getEmbeddingProvider();
  const isMock = provider instanceof MockEmbeddingProvider;

  if (isMock) {
    console.log('[Retriever] ⚠️  Mock embeddings active — using keyword fallback search');
    return retrieveByKeyword(query);
  }

  let queryEmbedding: number[];
  try {
    const embeddings = await provider.embed([query]);
    queryEmbedding = embeddings[0];
  } catch (embErr: any) {
    console.warn('[Retriever] Embedding failed — falling back to keyword search:', embErr?.message ?? embErr);
    return retrieveByKeyword(query);
  }

  const [kbResults, chunkResults] = await Promise.all([
    searchKnowledgeBase(queryEmbedding),
    searchDocumentChunks(queryEmbedding),
  ]);

  console.log(`[Retriever] Vector search: ${kbResults.length} KB hits, ${chunkResults.length} chunk hits`);
  kbResults.forEach((kb, i) =>
    console.log(`[Retriever]   KB[${i}] similarity=${kb.similarity?.toFixed(3)} Q="${(kb.question ?? kb.answer).slice(0, 60)}"`)
  );

  const sources: RetrievalSource[] = [];
  let totalTokens = 0;

  // KB entries first — authoritative, never truncated
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

  // Document chunks — cleaned and truncated before injection
  for (const chunk of chunkResults) {
    if (totalTokens >= MAX_CONTEXT_TOKENS) break;
    const heading = extractHeading(chunk.content);
    const cleanedText = cleanChunkText(chunk.content);
    const sourceLabel = buildSourceLabel(chunk.documentTitle, chunk.pageNumber, heading);
    const label = `[SOURCE: ${sourceLabel}]`;
    const tagged = `${label}\n${cleanedText}`;
    totalTokens += estimateTokens(tagged);
    if (totalTokens <= MAX_CONTEXT_TOKENS) {
      sources.push({ type: 'document', content: tagged, label });
    }
  }

  if (sources.length === 0) {
    console.log('[Retriever] Vector search returned 0 results — trying keyword fallback');
    return retrieveByKeyword(query);
  }

  return { context: buildFormattedContext(sources), sources };
}

// ── Keyword fallback search (SQL ILIKE) ────────────────────────────────────────
// Used when mock embeddings are active or when vector search returns nothing.

async function retrieveByKeyword(query: string): Promise<RetrievalResult> {
  const emptyResult: RetrievalResult = {
    context: 'No relevant information found in the knowledge base.',
    sources: [],
  };

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);

  if (terms.length === 0) return emptyResult;

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

    if (kbErr) console.error('[Retriever] Keyword KB search error:', kbErr.message);

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

    const chunkOrFilters = terms.map((term) => `content.ilike.%${term}%`);
    const { data: chunkRows, error: chunkErr } = await (db.from('ai_document_chunks') as any)
      .select('id, content, page_number, ai_documents(title)')
      .or(chunkOrFilters.join(','))
      .eq('ai_documents.is_active', true)
      .limit(CHUNK_LIMIT);

    if (chunkErr) console.error('[Retriever] Keyword chunk search error:', chunkErr.message);

    for (const chunk of (chunkRows ?? [])) {
      if (totalTokens >= MAX_CONTEXT_TOKENS) break;
      const docTitle = (chunk as any).ai_documents?.title ?? 'Document';
      const heading = extractHeading(chunk.content);
      const cleanedText = cleanChunkText(chunk.content);
      const sourceLabel = buildSourceLabel(docTitle, chunk.page_number, heading);
      const label = `[SOURCE: ${sourceLabel}]`;
      const tagged = `${label}\n${cleanedText}`;
      totalTokens += estimateTokens(tagged);
      if (totalTokens <= MAX_CONTEXT_TOKENS) {
        sources.push({ type: 'document', content: tagged, label });
      }
    }

    console.log(`[Retriever] Keyword fallback: ${sources.length} sources found for terms: [${terms.join(', ')}]`);

    if (sources.length === 0) return emptyResult;
    return { context: buildFormattedContext(sources), sources };
  } catch (err: any) {
    console.error('[Retriever] Keyword fallback failed:', err?.message ?? err);
    return emptyResult;
  }
}

// ── searchKnowledgeBaseTool — called by the agent tool dispatcher ──────────────

export async function searchKnowledgeBaseTool(query: string): Promise<string> {
  const result = await retrieve(query);
  if (result.sources.length === 0) return result.context;
  // Return structured context only. The system prompt (§8.3) instructs the LLM
  // on how to turn this into a human answer with a 📋 Source citation.
  return result.context;
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

  const hits = (data ?? []) as (ChunkHit & { similarity?: number })[];
  return hits.filter((h) => h.similarity == null || h.similarity >= CHUNK_SIMILARITY_THRESHOLD);
}
