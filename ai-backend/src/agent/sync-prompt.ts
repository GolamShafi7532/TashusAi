import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { readFile } from 'fs/promises';
import { join } from 'path';

const PROMPT_FILE = join(process.cwd(), 'src/agent/prompts/system-prompt.md');
const AGENT_CONFIG_CACHE_KEY = 'agent-config:active';

async function sync() {
  try {
    console.log('Reading system-prompt.md...');
    const prompt = await readFile(PROMPT_FILE, 'utf8');

    // Dynamically import project files to ensure env vars are validated after loadEnvConfig
    console.log('Loading database and cache clients...');
    const { db } = await import('../db/client');
    const { redis } = await import('../lib/redis');

    console.log('Fetching active agent config from Supabase...');
    const { data: existing, error: fetchError } = await db
      .from('ai_agent_configs')
      .select('id, config_key')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle() as any;

    if (fetchError) {
      throw new Error(`Failed to fetch active agent config: ${fetchError.message}`);
    }

    if (!existing) {
      console.log('No active config found in database. Creating a new default config...');
      const { error: insertError } = await (db.from('ai_agent_configs') as any)
        .insert({
          config_key: 'default',
          system_prompt: prompt,
          model: 'claude-2.1',
          temperature: 0.25,
          max_tokens: 1024,
          enabled_tools: [
            'search_vehicles',
            'get_vehicle_details',
            'check_availability',
            'validate_voucher',
            'search_knowledge_base',
            'escalate_to_human',
          ],
          is_active: true,
        });

      if (insertError) {
        throw new Error(`Failed to insert default config: ${insertError.message}`);
      }
      console.log('✅ Default config created successfully.');
    } else {
      console.log(`Updating active agent config (ID: ${existing.id}, Key: ${existing.config_key})...`);
      const { error: updateError } = await (db.from('ai_agent_configs') as any)
        .update({
          system_prompt: prompt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Failed to update agent config: ${updateError.message}`);
      }
      console.log('✅ Active agent config updated successfully in Supabase.');
    }

    console.log('Invalidating Redis cache...');
    await redis.del(AGENT_CONFIG_CACHE_KEY);
    console.log('✅ Redis cache invalidated.');

    console.log('Sync complete!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Sync failed:', err.message || err);
    process.exit(1);
  }
}

sync();
