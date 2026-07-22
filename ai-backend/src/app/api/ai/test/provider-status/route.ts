/**
 * GET /api/ai/test/provider-status
 * Returns real-time LLM provider key availability for the admin test console.
 */
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getCircuitState } from '@/agent/llm-providers/fallback-chain';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return `...${key.slice(-6)}`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: new Headers(CORS) });
}

export async function GET() {
  const grokKeys = (env.GROK_API_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const hasOpenRouter = !!env.OPENROUTER_API_KEY;
  const hasAnthropic  = !!env.ANTHROPIC_API_KEY;

  const circuitState = getCircuitState();

  const groqKeyStatuses = grokKeys.map((key, idx) => ({
    index:    idx + 1,
    masked:   maskKey(key),
    provider: 'groq',
  }));

  const providers = [
    {
      name:      'groq',
      label:     'Groq (Primary)',
      keys:      groqKeyStatuses.length,
      available: groqKeyStatuses.length > 0,
      circuit:   circuitState['groq'] ?? null,
      model:     'llama-3.3-70b-versatile',
      costPer1M: '$0.59 in / $0.79 out',
    },
    {
      name:      'openrouter',
      label:     'OpenRouter (Fallback 1)',
      keys:      hasOpenRouter ? 1 : 0,
      available: hasOpenRouter,
      circuit:   circuitState['openrouter'] ?? null,
      model:     'meta-llama/llama-3.1-70b-instruct',
      costPer1M: '$0.88 in+out',
    },
    {
      name:      'anthropic',
      label:     'Anthropic (Fallback 2)',
      keys:      hasAnthropic ? 1 : 0,
      available: hasAnthropic,
      circuit:   circuitState['anthropic'] ?? null,
      model:     'claude-sonnet',
      costPer1M: '$3.00 in / $15.00 out',
    },
  ];

  return NextResponse.json(
    { providers, groqKeys: groqKeyStatuses, timestamp: new Date().toISOString() },
    { headers: new Headers(CORS) }
  );
}
