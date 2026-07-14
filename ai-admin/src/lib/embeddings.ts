import { env } from './env';

export interface EmbeddingProvider {
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION || 1536;
    this.model = env.EMBEDDING_MODEL || 'text-embedding-3-large';
    this.apiKey = env.EMBEDDING_PROVIDER_API_KEY || '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI embeddings API ${res.status}: ${body}`);
      }

      const data = await res.json() as {
        data: { index: number; embedding: number[] }[];
      };

      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      console.error('[OpenAI Embeddings] Error:', err);
      throw err;
    }
  }
}

class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION || 1536;
    this.model = env.EMBEDDING_MODEL || 'voyage-large-2';
    this.apiKey = env.EMBEDDING_PROVIDER_API_KEY || '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Voyage AI embeddings API ${res.status}: ${body}`);
      }

      const data = await res.json() as {
        data: { index: number; embedding: number[] }[];
      };

      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      console.error('[Voyage Embeddings] Error:', err);
      throw err;
    }
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;

  constructor() {
    this.dimension = env.EMBEDDING_DIMENSION || 1536;
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
  const isDummyKey =
    !key ||
    key.startsWith('sk-dummy') ||
    key.includes('dummy') ||
    key.includes('example') ||
    key.includes('placeholder') ||
    key.length < 20;

  if (isDummyKey) {
    console.log('[EmbeddingProvider] Using MOCK embeddings for admin panel (dummy/missing API key detected)');
    _provider = new MockEmbeddingProvider();
    return _provider;
  }

  const providerType = env.EMBEDDING_PROVIDER || 'openai';
  if (providerType === 'voyage') {
    _provider = new VoyageEmbeddingProvider();
  } else {
    _provider = new OpenAIEmbeddingProvider();
  }

  if (_provider.dimension !== env.EMBEDDING_DIMENSION) {
    throw new Error(
      `EmbeddingProvider dimension mismatch: provider=${_provider.dimension}, env.EMBEDDING_DIMENSION=${env.EMBEDDING_DIMENSION}`
    );
  }

  return _provider;
}

export async function embedText(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  const embeddings = await provider.embed([text]);
  return embeddings[0];
}
