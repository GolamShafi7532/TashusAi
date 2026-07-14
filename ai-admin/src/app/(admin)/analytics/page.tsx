'use strict';
'use client';

import React, { useState, useEffect } from 'react';

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
      <div className="text-3xl font-black text-white" style={{ color: accent }}>
        {value}
      </div>
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
                  style={{
                    width: `${pct}%`,
                    backgroundColor: colors[idx % colors.length],
                  }}
                />
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-xs text-[#475569]">No data available yet.</p>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toolLogs, setToolLogs] = useState<any[]>([]);

  const fetchData = async () => {
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
        setToolLogs((data.logs || []).slice(0, 20));
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

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
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Sessions"
              value={metrics?.totalSessions ?? 0}
              subtext="All time conversations"
            />
            <MetricCard
              label="Active Now"
              value={metrics?.activeSessions ?? 0}
              subtext="Live chat sessions"
              accent="#34D399"
            />
            <MetricCard
              label="Human Handoffs"
              value={metrics?.handedOffSessions ?? 0}
              subtext="Currently in takeover"
              accent="#F2994A"
            />
            <MetricCard
              label="Handoff Rate"
              value={`${metrics?.handoffRate ?? 0}%`}
              subtext="Sessions requiring human"
              accent={metrics?.handoffRate > 20 ? '#F87171' : '#20B9BE'}
            />
            <MetricCard
              label="Total Tool Calls"
              value={metrics?.totalToolCalls ?? 0}
              subtext="API calls made by AI"
            />
            <MetricCard
              label="Avg Tool Latency"
              value={`${metrics?.avgToolLatencyMs ?? 0}ms`}
              subtext="Average tool response time"
              accent={metrics?.avgToolLatencyMs > 1000 ? '#F87171' : '#34D399'}
            />
            <MetricCard
              label="Closed Sessions"
              value={metrics?.closedSessions ?? 0}
              subtext="Completed conversations"
              accent="#818CF8"
            />
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DistributionBar
              label="Channel Distribution"
              data={distribution?.channels ?? {}}
              total={metrics?.totalSessions ?? 0}
            />
            <DistributionBar
              label="Tool Call Distribution"
              data={distribution?.tools ?? {}}
              total={metrics?.totalToolCalls ?? 0}
            />
          </div>

          {/* Tool Call Audit Log */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-[#1E293B] bg-[#090D11]/30 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Recent Tool Call Audit Log</h3>
              <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#1E293B] px-2.5 py-1 rounded-full border border-[#334155]">
                Last 20 entries
              </span>
            </div>

            {toolLogs.length === 0 ? (
              <div className="text-center text-sm text-[#94A3B8] py-12">No tool calls recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#090D11]/30">
                      <th className="px-6 py-3">Tool</th>
                      <th className="px-6 py-3">Endpoint</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Latency</th>
                      <th className="px-6 py-3">Cache</th>
                      <th className="px-6 py-3">Session</th>
                      <th className="px-6 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {toolLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#1E293B]/20 transition-all">
                        <td className="px-6 py-3 font-bold font-mono text-[#20B9BE]">{log.tool_name}</td>
                        <td className="px-6 py-3 font-mono text-[#94A3B8] truncate max-w-[180px]">{log.endpoint}</td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                            log.response_status >= 200 && log.response_status < 300
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {log.response_status ?? '—'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-[#94A3B8]">
                          {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                        </td>
                        <td className="px-6 py-3">
                          {log.cache_hit ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/20">HIT</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-gray-500/10 text-gray-400 border-gray-500/20">MISS</span>
                          )}
                        </td>
                        <td className="px-6 py-3 font-mono text-[#475569] text-[9px] truncate max-w-[100px]">
                          {log.session_id ? log.session_id.substring(0, 8) + '...' : '—'}
                        </td>
                        <td className="px-6 py-3 text-[#94A3B8]">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
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
