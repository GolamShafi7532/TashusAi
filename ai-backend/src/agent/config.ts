import { readFile } from 'fs/promises';
import { db, AiAgentConfig } from '@/db/client';
import { redis } from '@/lib/redis';

const AGENT_CONFIG_CACHE_KEY = 'agent-config:active';
import { join } from 'path';
const PROMPT_FILE = join(process.cwd(), 'src/agent/prompts/system-prompt.md');
const DEFAULT_MODEL = 'claude-2.1';
const DEFAULT_ENABLED_TOOLS = [
  'search_vehicles',
  'get_vehicle_details',
  'check_availability',
  'validate_voucher',
  'search_knowledge_base',
  'escalate_to_human',
];

export async function loadDefaultSystemPrompt(): Promise<string> {
  return await readFile(PROMPT_FILE, 'utf8');
}

export async function loadActiveAgentConfig(): Promise<AiAgentConfig> {
  const cached = await redis.get(AGENT_CONFIG_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as AiAgentConfig;
    } catch {
      console.warn('[AgentConfig] Failed to parse cached config');
    }
  }

  const { data, error } = await db
    .from('ai_agent_configs')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single() as any;

  if (!data || error) {
    const fallbackPrompt = await loadDefaultSystemPrompt();
    const fallback: AiAgentConfig = {
      id: 'default',
      config_key: 'default',
      system_prompt: fallbackPrompt,
      model: DEFAULT_MODEL,
      temperature: 0.25,
      max_tokens: 1024,
      enabled_tools: DEFAULT_ENABLED_TOOLS,
      is_active: true,
      updated_by: null,
      updated_at: new Date().toISOString(),
    };

    await redis.set(AGENT_CONFIG_CACHE_KEY, JSON.stringify(fallback), 'EX', 60);
    return fallback;
  }

  await redis.set(AGENT_CONFIG_CACHE_KEY, JSON.stringify(data), 'EX', 60);
  return data as AiAgentConfig;
}
