/**
 * EmbeddingProvider — provider-agnostic embedding interface.
 *
 * Decouples the embedding model from the RAG pipeline so it can be
 * swapped (e.g., OpenAI → Voyage AI) without touching schema or chunker.
 * The only schema concern is that vector(N) matches provider.dimension.
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */
import { env } from '@/lib/env';

// ── Interface ──────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
  /** Must match the vector(N) dimension declared in schema.sql */
  readonly dimension: number;
  /** Embed a batch of texts. Returns one float[] per input text. */
  embed(texts: string[]): Promise<number[][]>;
}

// ── OpenAI provider ────────────────────────────────────────────────────────────

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION;
    this.model = env.EMBEDDING_MODEL;
    this.apiKey = env.EMBEDDING_PROVIDER_API_KEY;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const MAX_BATCH = 128;
    const results: number[][] = [];

    // Process in batches to respect API rate limits
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const batchResults = await this.embedBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429 && attempt < 3) {
          // Rate limited — exponential backoff
          await sleep(1000 * 2 ** attempt);
          return this.embedBatch(texts, attempt + 1);
        }
        throw new Error(`OpenAI embeddings API ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };

      // Sort by index to guarantee order matches input
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      if (attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        return this.embedBatch(texts, attempt + 1);
      }
      throw err;
    }
  }
}

// ── Voyage AI provider ─────────────────────────────────────────────────────────

class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION;
    this.model = env.EMBEDDING_MODEL; // e.g. 'voyage-large-2'
    this.apiKey = env.EMBEDDING_PROVIDER_API_KEY;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const MAX_BATCH = 128;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const batchResults = await this.embedBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429 && attempt < 3) {
          await sleep(1000 * 2 ** attempt);
          return this.embedBatch(texts, attempt + 1);
        }
        throw new Error(`Voyage AI embeddings API ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };

      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      if (attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        return this.embedBatch(texts, attempt + 1);
      }
      throw err;
    }
  }
}

// ── Mock provider (for local testing without API keys) ─────────────────────────

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return texts.map((text) => this.generateSmartVector(text));
  }

  private generateSmartVector(text: string): number[] {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1);

    if (words.length === 0) {
      return this.generateWordVector("default");
    }

    const sumVector = new Array(this.dimension).fill(0);
    for (const word of words) {
      const wordVec = this.generateWordVector(word);
      for (let i = 0; i < this.dimension; i++) {
        sumVector[i] += wordVec[i];
      }
    }

    let magnitude = 0;
    for (let i = 0; i < this.dimension; i++) {
      magnitude += sumVector[i] * sumVector[i];
    }
    magnitude = Math.sqrt(magnitude);

    const normalizedVector: number[] = [];
    for (let i = 0; i < this.dimension; i++) {
      normalizedVector.push(magnitude > 0 ? sumVector[i] / magnitude : 0);
    }

    return normalizedVector;
  }

  private generateWordVector(word: string): number[] {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const vector: number[] = [];
    const seed = Math.abs(hash);

    for (let i = 0; i < this.dimension; i++) {
      const x = Math.sin((seed + i) * 12.9898) * 43758.5453;
      vector.push((x - Math.floor(x)) * 2 - 1); // Centered in [-1, 1)
    }

    return vector;
  }
}

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_provider) return _provider;

  const key = env.EMBEDDING_PROVIDER_API_KEY ?? '';

  // Use mock embeddings for development when no real key is configured
  const isDummyKey =
    !key ||
    key.startsWith('sk-dummy') ||
    key.includes('dummy') ||
    key.includes('example') ||
    key.includes('placeholder') ||
    key.length < 20;

  // Use mock embeddings when no real key is configured — regardless of NODE_ENV.
  // A dummy key in production is worse than mock: it wastes 7+ seconds on failed
  // API retries before falling back to slow keyword search.
  if (isDummyKey) {
    if (env.NODE_ENV !== 'production') {
      console.log('[EmbeddingProvider] Using MOCK embeddings (dummy/missing API key detected)');
    } else {
      console.warn('[EmbeddingProvider] ⚠️  Using MOCK embeddings in production — set a real EMBEDDING_PROVIDER_API_KEY for semantic search');
    }
    _provider = new MockEmbeddingProvider();
    return _provider;
  }

  switch (env.EMBEDDING_PROVIDER) {
    case 'voyage':
      _provider = new VoyageEmbeddingProvider();
      break;
    case 'openai':
    default:
      _provider = new OpenAIEmbeddingProvider();
  }

  // Dimension guard — fail fast if schema and provider disagree
  if (_provider.dimension !== env.EMBEDDING_DIMENSION) {
    throw new Error(
      `EmbeddingProvider dimension mismatch: provider=${_provider.dimension}, ` +
        `env.EMBEDDING_DIMENSION=${env.EMBEDDING_DIMENSION}. ` +
        `Update EMBEDDING_DIMENSION or the schema vector(N) column.`
    );
  }

  return _provider;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
