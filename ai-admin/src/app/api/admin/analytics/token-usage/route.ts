import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { verifyJwt } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TOKEN_COST: Record<string, { prompt: number; completion: number }> = {
  groq:       { prompt: 0.59  / 1_000_000, completion: 0.79  / 1_000_000 },
  openrouter: { prompt: 0.88  / 1_000_000, completion: 0.88  / 1_000_000 },
  anthropic:  { prompt: 3.00  / 1_000_000, completion: 15.00 / 1_000_000 },
};

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

function dateRange(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function monthRange(from: Date, to: Date): string[] {
  const months = new Set<string>();
  const cur = new Date(from);
  while (cur <= to) {
    months.add(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return Array.from(months);
}

/**
 * GET /api/admin/analytics/token-usage
 *
 * Query params:
 *   days   — past N days for daily view (default 30, max 90)
 *   months — past N months for monthly view (default 6, max 24)
 *
 * Response: { daily, monthly, totals, providerBreakdown }
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const days       = Math.min(parseInt(url.searchParams.get('days')   || '30', 10), 90);
    const monthsBack = Math.min(parseInt(url.searchParams.get('months') || '6',  10), 24);

    const now = new Date();

    const fromDay = new Date(now);
    fromDay.setUTCDate(fromDay.getUTCDate() - (days - 1));
    fromDay.setUTCHours(0, 0, 0, 0);

    const fromMonth = new Date(now);
    fromMonth.setUTCMonth(fromMonth.getUTCMonth() - (monthsBack - 1));
    fromMonth.setUTCDate(1);
    fromMonth.setUTCHours(0, 0, 0, 0);

    // Fetch all turn-summary rows from the wider monthly window.
    // If those rows do not exist or are still empty in older deployments,
    // fall back to assistant message token totals so the dashboard still renders.
    const { data: logs, error } = await (db.from('ai_tool_call_logs') as any)
      .select('created_at,tokens_in,tokens_out,token_cost_usd,provider')
      .eq('tool_name', '__turn_summary__')
      .gte('created_at', fromMonth.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[TokenUsageRoute] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve token usage' }, { status: 500 });
    }

    let rows = (logs ?? []) as Array<{
      created_at: string;
      tokens_in: number | null;
      tokens_out: number | null;
      token_cost_usd: number | null;
      provider: string | null;
    }>;

    const hasMeaningfulSummaryRows = rows.some((row) => (row.tokens_in ?? 0) > 0 || (row.tokens_out ?? 0) > 0 || (row.token_cost_usd ?? 0) > 0);

    if (!hasMeaningfulSummaryRows) {
      const { data: messageRows, error: messageError } = await (db.from('ai_chat_messages') as any)
        .select('created_at,tokens_in,tokens_out')
        .eq('role', 'assistant')
        .gte('created_at', fromMonth.toISOString())
        .order('created_at', { ascending: true });

      if (!messageError && messageRows) {
        rows = (messageRows ?? []).map((row: any) => ({
          created_at: row.created_at,
          tokens_in: row.tokens_in ?? null,
          tokens_out: row.tokens_out ?? null,
          token_cost_usd: null,
          provider: null,
        }));
      }
    }

    // Pre-build bucket maps with zero values so every date always appears in output
    const dailyMap = new Map<string, {
      date: string; tokensIn: number; tokensOut: number; costUsd: number; turns: number;
    }>();
    for (const d of dateRange(fromDay, now)) {
      dailyMap.set(d, { date: d, tokensIn: 0, tokensOut: 0, costUsd: 0, turns: 0 });
    }

    const monthlyMap = new Map<string, {
      month: string; tokensIn: number; tokensOut: number; costUsd: number; turns: number;
    }>();
    for (const m of monthRange(fromMonth, now)) {
      monthlyMap.set(m, { month: m, tokensIn: 0, tokensOut: 0, costUsd: 0, turns: 0 });
    }

    const providerMap: Record<string, { tokensIn: number; tokensOut: number; costUsd: number; turns: number }> = {};

    let grandTokIn = 0, grandTokOut = 0, grandCost = 0, grandTurns = 0;

    for (const row of rows) {
      const dateStr  = row.created_at.slice(0, 10);
      const monthStr = dateStr.slice(0, 7);
      const tokIn    = row.tokens_in  ?? 0;
      const tokOut   = row.tokens_out ?? 0;
      const provider = row.provider   ?? 'groq';

      let cost = row.token_cost_usd ?? 0;
      if (!cost && (tokIn || tokOut)) {
        const rates = TOKEN_COST[provider] ?? TOKEN_COST.groq;
        cost = tokIn * rates.prompt + tokOut * rates.completion;
      }

      const dayBucket = dailyMap.get(dateStr);
      if (dayBucket) {
        dayBucket.tokensIn  += tokIn;
        dayBucket.tokensOut += tokOut;
        dayBucket.costUsd   += cost;
        dayBucket.turns     += 1;
      }

      const monthBucket = monthlyMap.get(monthStr);
      if (monthBucket) {
        monthBucket.tokensIn  += tokIn;
        monthBucket.tokensOut += tokOut;
        monthBucket.costUsd   += cost;
        monthBucket.turns     += 1;
      }

      if (!providerMap[provider]) {
        providerMap[provider] = { tokensIn: 0, tokensOut: 0, costUsd: 0, turns: 0 };
      }
      providerMap[provider].tokensIn  += tokIn;
      providerMap[provider].tokensOut += tokOut;
      providerMap[provider].costUsd   += cost;
      providerMap[provider].turns     += 1;

      grandTokIn  += tokIn;
      grandTokOut += tokOut;
      grandCost   += cost;
      grandTurns  += 1;
    }

    // Round costs to 6 decimal places for readability
    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

    const daily   = Array.from(dailyMap.values()).map((b) => ({ ...b, costUsd: round(b.costUsd) }));
    const monthly = Array.from(monthlyMap.values()).map((b) => ({ ...b, costUsd: round(b.costUsd) }));
    const providerBreakdown = Object.fromEntries(
      Object.entries(providerMap).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])
    );

    return NextResponse.json({
      daily,
      monthly,
      providerBreakdown,
      totals: {
        tokensIn:  grandTokIn,
        tokensOut: grandTokOut,
        costUsd:   round(grandCost),
        turns:     grandTurns,
      },
    });
  } catch (err: any) {
    console.error('[TokenUsageRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
