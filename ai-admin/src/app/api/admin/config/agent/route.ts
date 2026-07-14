import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const AGENT_CONFIG_CACHE_KEY = 'agent-config:active';
const CONFIG_EDITABLE_ROLES = new Set(['admin', 'super_admin', 'agent']);

function canEditAgentConfig(role?: string | null) {
  return Boolean(role && CONFIG_EDITABLE_ROLES.has(role));
}

/**
 * GET /api/admin/config/agent
 * Retrieves the currently active AI Agent Configuration.
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: config, error } = await db
      .from('ai_agent_configs')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle() as any;

    if (error) {
      console.error('[AgentConfigRoute] DB Error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve agent configuration' }, { status: 500 });
    }

    return NextResponse.json({ config: config || null });
  } catch (err: any) {
    console.error('[AgentConfigRoute] GET Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/config/agent
 * Updates the AI Agent configuration and invalidates the Redis cache.
 */
export async function PATCH(req: Request) {
  try {
    // 1. Authenticate the admin
    const admin = await getAdminFromRequest(req);
    if (!admin || !admin.userId) {
      return NextResponse.json({ error: 'Unauthorized admin access' }, { status: 401 });
    }

    // Allow the signed-up admin accounts to edit configuration as well.
    if (!canEditAgentConfig(admin.role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      system_prompt,
      model,
      temperature,
      max_tokens,
      enabled_tools,
    } = body;

    // Validate fields
    if (!system_prompt || !model || temperature === undefined || !max_tokens || !enabled_tools) {
      return NextResponse.json({ error: 'Missing configuration parameters' }, { status: 400 });
    }

    // 2. Fetch existing active config
    const { data: existing } = await db
      .from('ai_agent_configs')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle() as any;

    let result;
    const configPayload = {
      system_prompt: system_prompt.trim(),
      model: model.trim(),
      temperature: Number(temperature),
      max_tokens: Number(max_tokens),
      enabled_tools,
      updated_by: admin.userId,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Update existing active configuration
      const { data, error } = await (db.from('ai_agent_configs') as any)
        .update(configPayload)
        .eq('id', existing.id)
        .select()
        .single() as any;
      
      if (error) throw error;
      result = data;
    } else {
      // Create new active configuration
      const { data, error } = await db
        .from('ai_agent_configs')
        .insert({
          ...configPayload,
          config_key: 'production',
          is_active: true,
        } as any)
        .select()
        .single() as any;
      
      if (error) throw error;
      result = data;
    }

    // 3. Clear Redis active config cache immediately
    await getRedisClient().del(AGENT_CONFIG_CACHE_KEY);

    return NextResponse.json({ success: true, config: result });
  } catch (err: any) {
    console.error('[AgentConfigRoute] PATCH Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
