import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { db } = await import('../src/db/client');
  const { data: users, error } = await db.from('ai_admin_users').select('*');
  console.log('Users in Supabase:', users);
  console.log('Error:', error);
  process.exit(0);
}

check();
