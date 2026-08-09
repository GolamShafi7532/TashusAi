import { readFile } from 'fs/promises';
import { db, AiAgentConfig } from '@/db/client';
import { redis } from '@/lib/redis';

const AGENT_CONFIG_CACHE_KEY = 'agent-config:active';
import { join } from 'path';
const PROMPT_FILE = join(process.cwd(), 'src/agent/prompts/system-prompt.md');
const DEFAULT_MODEL = 'openai/gpt-oss-120b'; // Groq model ID — requires openai/ prefix
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
  // Always load the current file-based system prompt so code changes
  // take effect immediately without requiring a DB update or cache flush.
  const filePrompt = await loadDefaultSystemPrompt();

  const cached = await redis.get(AGENT_CONFIG_CACHE_KEY);
  if (cached) {
    try {
      const config = JSON.parse(cached) as AiAgentConfig;
      // Override system_prompt with the current file version
      return { ...config, system_prompt: filePrompt };
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
    const fallback: AiAgentConfig = {
      id: 'default',
      config_key: 'default',
      system_prompt: filePrompt,
      model: DEFAULT_MODEL,
      temperature: 0.25,
      max_tokens: 1024,
      enabled_tools: DEFAULT_ENABLED_TOOLS,
      is_active: true,
      updated_by: null,
      updated_at: new Date().toISOString(),
    };

    await redis.set(AGENT_CONFIG_CACHE_KEY, JSON.stringify(fallback), 'EX', 300);
    return fallback;
  }

  await redis.set(AGENT_CONFIG_CACHE_KEY, JSON.stringify(data), 'EX', 300);
  // Always use file prompt — never serve a stale DB copy
  return { ...(data as AiAgentConfig), system_prompt: filePrompt };
}
