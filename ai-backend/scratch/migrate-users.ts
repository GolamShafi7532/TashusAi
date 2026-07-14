import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { promises as fs } from 'fs';
import path from 'path';

async function migrate() {
  const { db } = await import('../src/db/client');
  
  const jsonPath = path.join(__dirname, '../../ai-admin/.local-admin-data/auth-store.json');
  try {
    console.log('Reading local store from:', jsonPath);
    const raw = await fs.readFile(jsonPath, 'utf8');
    const store = JSON.parse(raw);
    const localUsers = store.ai_admin_users || [];
    
    if (localUsers.length === 0) {
      console.log('No local users found to migrate.');
      process.exit(0);
    }
    
    console.log(`Found ${localUsers.length} local users. Migrating to Supabase...`);
    
    // Map local users to supabase schema, removing the 'local-' prefix from IDs so we can use UUID or let gen_random_uuid do it
    const rows = localUsers.map((u: any) => {
      // If the ID is not a valid UUID, let's omit it so the database generates a valid UUID automatically,
      // or clean it if possible. But since id is primary key and gen_random_uuid() is active, we can omit id or generate one
      return {
        email: u.email,
        password_hash: u.password_hash,
        display_name: u.display_name,
        role: u.role || 'agent',
        is_active: u.is_active ?? true,
      };
    });
    
    for (const row of rows) {
      console.log(`Migrating user: ${row.email}...`);
      // Check if user already exists
      const { data: existing } = await db.from('ai_admin_users').select('id').eq('email', row.email).maybeSingle();
      
      if (existing) {
        console.log(`User ${row.email} already exists. Skipping.`);
        continue;
      }
      
      const { error } = await db.from('ai_admin_users').insert(row as any);
      if (error) {
        console.error(`Failed to migrate ${row.email}:`, error.message);
      } else {
        console.log(`✅ Successfully migrated ${row.email}`);
      }
    }
    
    console.log('Migration complete!');
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
  }
  process.exit(0);
}

migrate();
