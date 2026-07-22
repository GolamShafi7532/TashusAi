import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Token cost per input token by provider (USD)
const TOKEN_COST: Record<string, { prompt: number; completion: number }> = {
  groq:       { prompt: 0.59  / 1_000_000, completion: 0.79  / 1_000_000 },
  openrouter: { prompt: 0.88  / 1_000_000, completion: 0.88  / 1_000_000 },
  anthropic:  { prompt: 3.00  / 1_000_000, completion: 15.00 / 1_000_000 },
};

/** Resolve admin — bypass auth in local dev mode */
async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin' };
  }
  const token = req.headers.get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('admin_access_token='))
    ?.split('=')[1];
  return token ? await verifyJwt(token) : null;
}

/**
 * GET /api/admin/analytics/overview
 * Aggregates high-level support inbox metrics and performance statistics.
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch sessions statuses count
    const { data: sessions, error: sessionsErr } = await db
      .from('ai_chat_sessions')
      .select('status,channel') as any;

    if (sessionsErr || !sessions) {
      console.error('[AnalyticsRoute] DB Session query error:', sessionsErr?.message);
      return NextResponse.json({ error: 'Failed to retrieve analytics data' }, { status: 500 });
    }

    const totalSessions = sessions.length;
    let activeCount = 0;
    let handoffCount = 0;
    let closedCount = 0;
    const channelDistribution: Record<string, number> = {};

    for (const session of sessions) {
      if (session.status === 'active') activeCount++;
      else if (session.status === 'handed_off') handoffCount++;
      else if (session.status === 'closed' || session.status === 'archived') closedCount++;

      const ch = session.channel || 'widget';
      channelDistribution[ch] = (channelDistribution[ch] || 0) + 1;
    }

    const handoffRate = totalSessions > 0 ? (handoffCount / totalSessions) * 100 : 0;

    // 2. Fetch tool call logs with token data
    const { data: toolLogs } = await db
      .from('ai_tool_call_logs')
      .select('tool_name,duration_ms,tokens_in,tokens_out,token_cost_usd,provider') as any;

    const totalToolCalls = toolLogs?.length || 0;
    let totalLatency = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostUsd = 0;
    const toolCallDistribution: Record<string, number> = {};

    if (toolLogs) {
      for (const log of toolLogs) {
        totalLatency   += log.duration_ms   || 0;
        totalTokensIn  += log.tokens_in     || 0;
        totalTokensOut += log.tokens_out    || 0;

        // Use stored cost if available, otherwise estimate from tokens
        if (log.token_cost_usd != null) {
          totalCostUsd += log.token_cost_usd;
        } else if (log.tokens_in || log.tokens_out) {
          const provider = log.provider || 'groq';
          const costs = TOKEN_COST[provider] ?? TOKEN_COST.groq;
          totalCostUsd += (log.tokens_in || 0) * costs.prompt + (log.tokens_out || 0) * costs.completion;
        }

        // v3.1.0: Exclude __turn_summary__ from tool distribution (it's metadata, not a real tool call)
        if (log.tool_name !== '__turn_summary__') {
          toolCallDistribution[log.tool_name] = (toolCallDistribution[log.tool_name] || 0) + 1;
        }
      }
    }

    const avgToolCallDuration = totalToolCalls > 0 ? totalLatency / totalToolCalls : 0;

    return NextResponse.json({
      metrics: {
        totalSessions,
        activeSessions:    activeCount,
        handedOffSessions: handoffCount,
        closedSessions:    closedCount,
        handoffRate:       parseFloat(handoffRate.toFixed(1)),
        totalToolCalls,
        avgToolLatencyMs:  Math.round(avgToolCallDuration),
        totalTokensIn,
        totalTokensOut,
        totalCostUsd:      parseFloat(totalCostUsd.toFixed(4)),
      },
      distribution: {
        channels: channelDistribution,
        tools:    toolCallDistribution,
      },
    });
  } catch (err: any) {
    console.error('[AnalyticsRoute] GET Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
