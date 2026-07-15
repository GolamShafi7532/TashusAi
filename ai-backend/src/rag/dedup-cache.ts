/**
 * RAG Deduplication Cache (v3.1.0 — Phase B.1.2)
 *
 * Problem: Both proactive RAG (orchestrator intent check) and the reactive
 * `search_knowledge_base` tool can fire on the same turn, retrieving the
 * same content twice — doubling token cost for policy/FAQ queries.
 *
 * Solution: After proactive RAG runs, cache the query embedding + results in
 * Redis (TTL: 5 minutes, scoped per session). When the LLM later calls
 * `search_knowledge_base` with a semantically similar query (cosine > 0.88),
 * return the cached result with a [System: Already in context] prefix so the
 * LLM skips re-reading the same context.
 *
 * Token savings: 2,000 (proactive) + 0 (deduped) = 50% reduction vs
 *               2,000 (proactive) + 2,000 (tool call) = 4,000 previously.
 *
 * NOT a replacement for the search_knowledge_base tool — the LLM can still
 * call it for different topics in the same conversation. Only exact/near-
 * duplicate queries within the same turn are suppressed.
 */
import { redis } from '@/lib/redis';
import { getEmbeddingProvider } from './embedding-provider';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CachedRAGEntry {
  query: string;
  queryEmbedding: number[];
  context: string;   // The formatted context string from retrieve()
  cachedAt: number;  // Unix ms timestamp
}

// ── Cosine similarity helper ───────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

// ── Cache implementation ───────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 300;          // 5 minutes — covers a full conversation turn
const SIMILARITY_THRESHOLD   = 0.88;   // Cosine similarity above which queries are "the same topic"

export class RAGDedupCache {

  private cacheKey(sessionId: string): string {
    return `rag:dedup:${sessionId}`;
  }

  /**
   * Store a successful RAG retrieval for this session turn.
   * Called by the orchestrator immediately after proactive RAG runs.
   */
  async store(sessionId: string, query: string, context: string): Promise<void> {
    try {
      const embedder = getEmbeddingProvider();
      const [queryEmbedding] = await embedder.embed([query]);

      const entry: CachedRAGEntry = {
        query,
        queryEmbedding,
        context,
        cachedAt: Date.now(),
      };

      await redis.setex(
        this.cacheKey(sessionId),
        DEDUP_TTL_SECONDS,
        JSON.stringify(entry)
      );

      console.log(`[RAGDedup] Stored entry for session ${sessionId} | query="${query.slice(0, 60)}"`);
    } catch (err) {
      // Non-critical — if caching fails the tool call will just run normally
      console.warn('[RAGDedup] Failed to store entry:', (err as Error).message);
    }
  }

  /**
   * Check if a new query is semantically similar to the cached entry.
   *
   * Returns:
   *  - The cached context string (with a [System:] prefix) if similarity > threshold
   *  - null if no cache entry or similarity is below threshold
   *
   * The caller should return the cached string as the tool_result content
   * instead of running a fresh retrieval.
   */
  async checkDuplicate(sessionId: string, newQuery: string): Promise<string | null> {
    try {
      const raw = await redis.get(this.cacheKey(sessionId));
      if (!raw) return null;

      const entry: CachedRAGEntry = JSON.parse(raw);

      // Embed the new query and compare
      const embedder = getEmbeddingProvider();
      const [newEmbedding] = await embedder.embed([newQuery]);

      const similarity = cosineSimilarity(entry.queryEmbedding, newEmbedding);

      console.log(`[RAGDedup] Similarity check: ${similarity.toFixed(3)} | threshold: ${SIMILARITY_THRESHOLD} | session=${sessionId}`);

      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(`[RAGDedup] Cache HIT — returning cached context (saved ~2,000 tokens)`);
        return (
          `[System: This knowledge base content was already retrieved at the start of this ` +
          `turn (similarity=${similarity.toFixed(2)}). Use the context already in your ` +
          `system prompt rather than re-reading it.]\n\n` +
          entry.context.slice(0, 300) + '…'
        );
      }

      console.log(`[RAGDedup] Cache MISS — similarity too low, running fresh retrieval`);
      return null;
    } catch (err) {
      console.warn('[RAGDedup] Cache check failed — allowing fresh retrieval:', (err as Error).message);
      return null;
    }
  }

  /**
   * Explicitly clear the dedup cache for a session (e.g. on session reset).
   */
  async clear(sessionId: string): Promise<void> {
    try {
      await redis.del(this.cacheKey(sessionId));
    } catch {
      // non-critical
    }
  }
}

// Singleton — shared across all orchestrator calls
export const ragDedupCache = new RAGDedupCache();
