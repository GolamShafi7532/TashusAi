import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { db } = await import('../src/db/client');
  const { data: kb, error } = await db.from('ai_knowledge_base').select('*');
  console.log('Knowledge Base Entries:', kb);
  console.log('Error:', error);
  process.exit(0);
}

check();
