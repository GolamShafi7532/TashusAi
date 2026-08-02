/**
 * Test tools inspection endpoint.
 * Returns all available tools, schemas, descriptions, and enabled status.
 * Useful for understanding what tools the agent can call.
 */
import { NextResponse } from 'next/server';
import { AGENT_TOOLS } from '@/agent/tools';
import { loadActiveAgentConfig } from '@/agent/config';

export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    // Load active agent config to check which tools are enabled
    const config = await loadActiveAgentConfig();
    const enabledTools = new Set(config.enabled_tools || []);

    const tools = AGENT_TOOLS.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      enabled: enabledTools.has(tool.name),
      schema: {
        type: tool.input_schema?.type,
        properties: tool.input_schema?.properties,
        required: tool.input_schema?.required,
      },
    }));

    return NextResponse.json({
      tools,
      totalTools: tools.length,
      enabledCount: tools.filter((t: any) => t.enabled).length,
      config: {
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        isActive: config.is_active,
      }
    }, { 
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (err: any) {
    console.error('[TestToolsRoute] Error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: new Headers({
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }),
  });
}
