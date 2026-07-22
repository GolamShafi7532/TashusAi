'use strict';
'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ── Small reusable components ─────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtext,
  accent = '#20B9BE',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6 hover:border-[#334155] transition-all">
      <div className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-3">{label}</div>
      <div className="text-3xl font-black" style={{ color: accent }}>{value}</div>
      {subtext && <p className="text-[10px] text-[#94A3B8] mt-2">{subtext}</p>}
    </div>
  );
}

function DistributionBar({
  label,
  data,
  total,
}: {
  label: string;
  data: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const colors = ['#20B9BE', '#F2994A', '#818CF8', '#34D399', '#F472B6', '#FB923C'];
  return (
    <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6 space-y-4">
      <h4 className="font-bold text-white text-sm">{label}</h4>
      <div className="space-y-3">
        {entries.map(([key, count], idx) => {
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-[#E4E6EB] font-mono capitalize">{key.replace('_', ' ')}</span>
                <span className="text-[10px] text-[#94A3B8]">{count} ({pct}%)</span>
              </div>
              <div className="w-full h-2 bg-[#1E293B] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: colors[idx % colors.length] }}
                />
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-xs text-[#475569]">No data available yet.</p>}
      </div>
    </div>
  );
}

// ── Inline sparkline bar-chart (no external deps) ─────────────────────────────
function SparkBarChart({
  data,
  valueKey,
  labelKey,
  color = '#20B9BE',
  formatValue,
  title,
  subtitle,
}: {
  data: Record<string, any>[];
  valueKey: string;
  labelKey: string;
  color?: string;
  formatValue?: (v: number) => string;
  title: string;
  subtitle?: string;
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 0.000001);
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());

  // Show last 30 items maximum for readability
  const visible = data.slice(-30);
  const visibleValues = visible.map((d) => Number(d[valueKey]) || 0);

  return (
    <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-bold text-white text-sm">{title}</h4>
          {subtitle && <p className="text-[10px] text-[#94A3B8] mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs font-bold" style={{ color }}>
          {fmt(values.reduce((a, b) => a + b, 0))} total
        </span>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-[#475569] text-center py-8">No data in selected range.</p>
      ) : (
        <>
          {/* Bar chart */}
          <div className="flex items-end gap-px h-20 w-full">
            {visibleValues.map((val, idx) => {
              const heightPct = max > 0 ? (val / max) * 100 : 0;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t-sm transition-all duration-300 group relative cursor-default"
                  style={{ height: `${Math.max(heightPct, val > 0 ? 2 : 0)}%`, backgroundColor: color, opacity: 0.8 }}
                  title={`${visible[idx][labelKey]}: ${fmt(val)}`}
                />
              );
            })}
          </div>

          {/* X-axis labels — show first, middle, last */}
          <div className="flex justify-between text-[9px] text-[#475569] mt-1 font-mono">
            <span>{visible[0]?.[labelKey] ?? ''}</span>
            <span>{visible[Math.floor(visible.length / 2)]?.[labelKey] ?? ''}</span>
            <span>{visible[visible.length - 1]?.[labelKey] ?? ''}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────────────
function ProviderBadge({ provider }: { provider: string | null }) {
  const p = provider ?? 'unknown';
  const styles: Record<string, string> = {
    groq:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
    openrouter: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    anthropic:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    unknown:    'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${styles[p] ?? styles.unknown}`}>
      {p}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [metrics, setMetrics]           = useState<any>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [toolLogs, setToolLogs]         = useState<any[]>([]);
  const [tokenUsage, setTokenUsage]     = useState<any>(null);
  const [usageView, setUsageView]       = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading]           = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const [overviewRes, toolRes] = await Promise.all([
        fetch('/api/admin/analytics/overview'),
        fetch('/api/admin/audit/tool-calls'),
      ]);
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setMetrics(data.metrics);
        setDistribution(data.distribution);
      }
      if (toolRes.ok) {
        const data = await toolRes.json();
        // Keep turn-summary rows so the admin dashboard can display token/cost spans
        // for LLM turns alongside raw tool execution logs.
        const visible = (data.logs || []).slice(0, 20);
        setToolLogs(visible);
      }
    } catch (err) {
      console.error('Failed to load analytics overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTokenUsage = useCallback(async () => {
    setTokenLoading(true);
    try {
      const res = await fetch('/api/admin/analytics/token-usage?days=30&months=6');
      if (res.ok) {
        const data = await res.json();
        setTokenUsage(data);
      }
    } catch (err) {
      console.error('Failed to load token usage:', err);
    } finally {
      setTokenLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchTokenUsage();
    const interval = setInterval(fetchOverview, 30_000);
    return () => clearInterval(interval);
  }, [fetchOverview, fetchTokenUsage]);

  const fmtCost  = (n: number) => `$${n.toFixed(4)}`;
  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-8 w-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <>
          {/* ── Key Metrics ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Sessions"   value={metrics?.totalSessions ?? 0}    subtext="All time conversations" />
            <MetricCard label="Active Now"        value={metrics?.activeSessions ?? 0}   subtext="Live chat sessions"      accent="#34D399" />
            <MetricCard label="Human Handoffs"    value={metrics?.handedOffSessions ?? 0} subtext="Currently in takeover"  accent="#F2994A" />
            <MetricCard
              label="Handoff Rate"
              value={`${metrics?.handoffRate ?? 0}%`}
              subtext="Sessions requiring human"
              accent={metrics?.handoffRate > 20 ? '#F87171' : '#20B9BE'}
            />
            <MetricCard label="Total Tool Calls"  value={metrics?.totalToolCalls ?? 0}   subtext="API calls made by AI" />
            <MetricCard
              label="Avg Tool Latency"
              value={`${metrics?.avgToolLatencyMs ?? 0}ms`}
              subtext="Average tool response time"
              accent={metrics?.avgToolLatencyMs > 1000 ? '#F87171' : '#34D399'}
            />
            <MetricCard
              label="Total Tokens Used"
              value={fmtTokens((metrics?.totalTokensIn ?? 0) + (metrics?.totalTokensOut ?? 0))}
              subtext={`${fmtTokens(metrics?.totalTokensIn ?? 0)} in · ${fmtTokens(metrics?.totalTokensOut ?? 0)} out`}
              accent="#818CF8"
            />
            <MetricCard
              label="Estimated Cost"
              value={fmtCost(metrics?.totalCostUsd ?? 0)}
              subtext="Cumulative LLM spend (USD)"
              accent="#F2994A"
            />
          </div>

          {/* ── Distribution Charts ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DistributionBar label="Channel Distribution" data={distribution?.channels ?? {}} total={metrics?.totalSessions ?? 0} />
            <DistributionBar label="Tool Call Distribution" data={distribution?.tools ?? {}} total={metrics?.totalToolCalls ?? 0} />
          </div>

          {/* ── Token Usage Charts ────────────────────────────────────────── */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-white text-sm">Token Usage & Cost</h3>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">Based on LLM turn summaries logged by the backend</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setUsageView('daily')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    usageView === 'daily'
                      ? 'bg-[#20B9BE] text-white border-[#20B9BE]'
                      : 'bg-[#1E293B] text-[#94A3B8] border-[#334155] hover:border-[#20B9BE]'
                  }`}
                >
                  Daily (30d)
                </button>
                <button
                  onClick={() => setUsageView('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    usageView === 'monthly'
                      ? 'bg-[#20B9BE] text-white border-[#20B9BE]'
                      : 'bg-[#1E293B] text-[#94A3B8] border-[#334155] hover:border-[#20B9BE]'
                  }`}
                >
                  Monthly (6mo)
                </button>
              </div>
            </div>

            {tokenLoading ? (
              <div className="flex justify-center py-10">
                <svg className="animate-spin h-6 w-6 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <>
                {/* Totals row */}
                {tokenUsage?.totals && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Turns',     value: tokenUsage.totals.turns,     fmt: (n: number) => n.toLocaleString(), color: '#34D399' },
                      { label: 'Tokens In', value: tokenUsage.totals.tokensIn,  fmt: fmtTokens,  color: '#818CF8' },
                      { label: 'Tokens Out',value: tokenUsage.totals.tokensOut, fmt: fmtTokens,  color: '#20B9BE' },
                      { label: 'Total Cost',value: tokenUsage.totals.costUsd,   fmt: fmtCost,    color: '#F2994A' },
                    ].map(({ label, value, fmt, color }) => (
                      <div key={label} className="bg-[#090D11] border border-[#1E293B] rounded-xl p-4 text-center">
                        <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-1">{label}</div>
                        <div className="text-xl font-black" style={{ color }}>{fmt(value ?? 0)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bar charts */}
                {usageView === 'daily' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SparkBarChart
                      title="Daily Tokens"
                      subtitle="Input + Output combined"
                      data={(tokenUsage?.daily ?? []).map((d: any) => ({
                        ...d,
                        totalTokens: d.tokensIn + d.tokensOut,
                        label: d.date.slice(5), // MM-DD
                      }))}
                      valueKey="totalTokens"
                      labelKey="label"
                      color="#818CF8"
                      formatValue={fmtTokens}
                    />
                    <SparkBarChart
                      title="Daily Cost (USD)"
                      subtitle="Estimated LLM spend per day"
                      data={(tokenUsage?.daily ?? []).map((d: any) => ({
                        ...d,
                        label: d.date.slice(5),
                      }))}
                      valueKey="costUsd"
                      labelKey="label"
                      color="#F2994A"
                      formatValue={fmtCost}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SparkBarChart
                      title="Monthly Tokens"
                      subtitle="Input + Output combined per month"
                      data={(tokenUsage?.monthly ?? []).map((d: any) => ({
                        ...d,
                        totalTokens: d.tokensIn + d.tokensOut,
                        label: d.month,
                      }))}
                      valueKey="totalTokens"
                      labelKey="label"
                      color="#818CF8"
                      formatValue={fmtTokens}
                    />
                    <SparkBarChart
                      title="Monthly Cost (USD)"
                      subtitle="Estimated LLM spend per month"
                      data={(tokenUsage?.monthly ?? []).map((d: any) => ({ ...d, label: d.month }))}
                      valueKey="costUsd"
                      labelKey="label"
                      color="#F2994A"
                      formatValue={fmtCost}
                    />
                  </div>
                )}

                {/* Provider breakdown */}
                {tokenUsage?.providerBreakdown && Object.keys(tokenUsage.providerBreakdown).length > 0 && (
                  <div className="bg-[#090D11] border border-[#1E293B] rounded-xl p-4">
                    <h5 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-3">Provider Breakdown</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {Object.entries(tokenUsage.providerBreakdown).map(([provider, stats]: [string, any]) => (
                        <div key={provider} className="bg-[#0F161E] border border-[#1E293B] rounded-xl p-3 space-y-1">
                          <ProviderBadge provider={provider} />
                          <div className="text-xs text-[#94A3B8] mt-2">
                            <span className="font-semibold text-white">{stats.turns}</span> turns ·{' '}
                            <span className="font-semibold text-white">{fmtTokens(stats.tokensIn + stats.tokensOut)}</span> tokens
                          </div>
                          <div className="text-sm font-bold text-[#F2994A]">{fmtCost(stats.costUsd)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Tool Call Audit Log ───────────────────────────────────────── */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-[#1E293B] bg-[#090D11]/30 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Recent Tool Call Audit Log</h3>
              <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#1E293B] px-2.5 py-1 rounded-full border border-[#334155]">
                Last 20 entries
              </span>
            </div>

            {toolLogs.length === 0 ? (
              <div className="text-center text-sm text-[#94A3B8] py-12">No tool calls recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#090D11]/30">
                      <th className="px-4 py-3">Tool</th>
                      <th className="px-4 py-3">Endpoint</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Latency</th>
                      <th className="px-4 py-3">Cache</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Tokens</th>
                      <th className="px-4 py-3 text-right">Cost (USD)</th>
                      <th className="px-4 py-3">Session</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {toolLogs.map((log) => {
                      const tokTotal = (log.tokens_in ?? 0) + (log.tokens_out ?? 0);
                      return (
                        <tr key={log.id} className="hover:bg-[#1E293B]/20 transition-all">
                          <td className="px-4 py-3 font-bold font-mono text-[#20B9BE] whitespace-nowrap">{log.tool_name}</td>
                          <td className="px-4 py-3 font-mono text-[#94A3B8] truncate max-w-[160px]">{log.endpoint}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                              log.response_status >= 200 && log.response_status < 300
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {log.response_status ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">
                            {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {log.cache_hit
                              ? <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/20">HIT</span>
                              : <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-gray-500/10 text-gray-400 border-gray-500/20">MISS</span>}
                          </td>
                          <td className="px-4 py-3">
                            {log.provider ? <ProviderBadge provider={log.provider} /> : <span className="text-[#475569]">—</span>}
                          </td>
                          <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap font-mono text-[10px]">
                            {tokTotal > 0 ? (
                              <span title={`${log.tokens_in ?? 0} in / ${log.tokens_out ?? 0} out`}>
                                {fmtTokens(tokTotal)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {log.token_cost_usd != null && log.token_cost_usd > 0 ? (
                              <span className="font-mono text-[#F2994A] font-semibold text-[10px]">
                                ${Number(log.token_cost_usd).toFixed(5)}
                              </span>
                            ) : (
                              <span className="text-[#475569]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-[#475569] text-[9px] truncate max-w-[90px]">
                            {log.session_id ? log.session_id.substring(0, 8) + '…' : '—'}
                          </td>
                          <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
