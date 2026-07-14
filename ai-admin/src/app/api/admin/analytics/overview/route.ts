import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/overview
 * Aggregates high-level support inbox metrics and performance statistics.
 */
export async function GET(req: Request) {
  try {
    // Authenticate
    const token = req.headers.get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('admin_access_token='))
      ?.split('=')[1];

    const admin = token ? await verifyJwt(token) : null;
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

    // 2. Fetch tool calls counts
    const { data: toolLogs } = await db
      .from('ai_tool_call_logs')
      .select('tool_name,duration_ms') as any;

    const totalToolCalls = toolLogs?.length || 0;
    let totalLatency = 0;
    const toolCallDistribution: Record<string, number> = {};

    if (toolLogs) {
      for (const log of toolLogs) {
        totalLatency += log.duration_ms || 0;
        toolCallDistribution[log.tool_name] = (toolCallDistribution[log.tool_name] || 0) + 1;
      }
    }

    const avgToolCallDuration = totalToolCalls > 0 ? totalLatency / totalToolCalls : 0;

    return NextResponse.json({
      metrics: {
        totalSessions,
        activeSessions: activeCount,
        handedOffSessions: handoffCount,
        closedSessions: closedCount,
        handoffRate: parseFloat(handoffRate.toFixed(1)),
        totalToolCalls,
        avgToolLatencyMs: Math.round(avgToolCallDuration),
      },
      distribution: {
        channels: channelDistribution,
        tools: toolCallDistribution,
      },
    });
  } catch (err: any) {
    console.error('[AnalyticsRoute] GET Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
