/**
 * Re-embed all existing ai_knowledge_base entries using the current
 * embedding provider. Run this after upgrading MockEmbeddingProvider
 * to ensure stored vectors are consistent with new query vectors.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function reembedKb() {
  const { getEmbeddingProvider } = await import('../src/rag/embedding-provider');
  const { db } = await import('../src/db/client');

  const { data: entries, error } = await db.from('ai_knowledge_base').select('*');
  if (error) {
    console.error('Failed to fetch KB entries:', error.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('No KB entries to re-embed.');
    process.exit(0);
  }

  console.log(`Re-embedding ${entries.length} KB entries...`);
  const provider = getEmbeddingProvider();
  console.log(`Provider: ${provider.constructor.name}, Dimension: ${provider.dimension}`);

  for (const entry of entries as any[]) {
    const textToEmbed = entry.question
      ? `Question: ${entry.question}\nAnswer: ${entry.answer}`
      : entry.answer;

    const [embedding] = await provider.embed([textToEmbed]);

    const { error: updateErr } = await db
      .from('ai_knowledge_base')
      .update({ embedding } as any)
      .eq('id', entry.id);

    if (updateErr) {
      console.error(`❌ Failed to update ${entry.id}:`, updateErr.message);
    } else {
      console.log(`✅ Re-embedded: "${entry.question ?? entry.answer.slice(0, 50)}..."`);
    }
  }

  console.log('\nDone! All KB entries are now using the latest embedding vectors.');
  process.exit(0);
}

reembedKb();
