import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { db } = await import('../src/db/client');
  const { data: docs, error } = await db.from('ai_documents').select('*');
  console.log('Documents:', docs);
  console.log('Error:', error);
  process.exit(0);
}

check();
