import { createClient } from '@supabase/supabase-js';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const email = 'admin@tashus.com';
  const password = 'AdminPassword123!';
  const displayName = 'Super Admin';

  console.log(`Seeding admin user: ${email}...`);

  // Hash password using argon2id matching lib/auth.ts setup
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 4,
  });

  const { data, error } = await supabase
    .from('ai_admin_users')
    .upsert({
      email,
      password_hash: passwordHash,
      display_name: displayName,
      role: 'super_admin',
      is_active: true,
    }, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    console.error('Failed to seed admin user:', error.message);
    process.exit(1);
  }

  console.log('✅ Admin user seeded successfully:', data);
}

main().catch((err) => {
  console.error('Seeding crashed:', err);
  process.exit(1);
});
