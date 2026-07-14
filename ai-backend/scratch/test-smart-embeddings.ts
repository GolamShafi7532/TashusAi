class SmartMockEmbeddingProvider {
  readonly dimension = 1536;

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
      vector.push((x - Math.floor(x)) * 2 - 1);
    }

    return vector;
  }
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

async function run() {
  const provider = new SmartMockEmbeddingProvider();
  
  const doc1 = "Question: Do you have service at Melbourne?\nAnswer: No, we do not have any service in Melbourne right now. We only have service in Sydney.";
  const doc2 = "Question: Can I smoke inside the car?\nAnswer: Smoking is strictly prohibited inside the car.";
  
  const query1 = "Do you have service at Melbourne?";
  const query2 = "Can I smoke inside?";
  const query3 = "What is the policy for cancellation?";
  
  const [vDoc1, vDoc2, vQuery1, vQuery2, vQuery3] = await Promise.all([
    provider.generateSmartVector(doc1),
    provider.generateSmartVector(doc2),
    provider.generateSmartVector(query1),
    provider.generateSmartVector(query2),
    provider.generateSmartVector(query3),
  ]);
  
  console.log('Cosine Sim (Query: Melbourne, Doc: Melbourne):', dotProduct(vQuery1, vDoc1));
  console.log('Cosine Sim (Query: Melbourne, Doc: Smoking):', dotProduct(vQuery1, vDoc2));
  console.log('Cosine Sim (Query: Smoking, Doc: Smoking):', dotProduct(vQuery2, vDoc2));
  console.log('Cosine Sim (Query: Smoking, Doc: Melbourne):', dotProduct(vQuery2, vDoc1));
  console.log('Cosine Sim (Query: Cancel, Doc: Melbourne):', dotProduct(vQuery3, vDoc1));
}

run();
