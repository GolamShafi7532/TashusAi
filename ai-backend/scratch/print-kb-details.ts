import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { db } = await import('../src/db/client');
  const { data: kb } = await db.from('ai_knowledge_base').select('id, entry_type, question, answer, embedding');
  if (kb) {
    for (const entry of kb) {
      console.log(`- ID: ${entry.id}`);
      console.log(`  Type: ${entry.entry_type}`);
      console.log(`  Question: "${entry.question}"`);
      console.log(`  Answer: "${entry.answer}"`);
      console.log(`  Has Embedding: ${entry.embedding !== null}`);
      if (entry.embedding) {
        console.log(`  Embedding sample (first 3 dimensions):`, entry.embedding.slice(0, 3));
      }
    }
  }
  process.exit(0);
}

check();
