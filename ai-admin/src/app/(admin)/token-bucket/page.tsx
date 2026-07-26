'use strict';
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
interface KeyStatus {
  index: number;
  masked: string;
  available: boolean;
  cooldownSeconds: number;
  cooldownReason: string | null;
  successCount: number;
  failureCount: number;
}

interface BucketStatus {
  keys: KeyStatus[];
  availableCount: number;
  totalKeys: number;
  allCoolingDown: boolean;
  nextAvailableIn: number;
}

export default function TokenBucketPage() {
  const [status, setStatus] = useState<BucketStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/token-bucket');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch token bucket status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  const rateLimitAlert = status?.allCoolingDown && (
    <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <h4 className="font-bold">All keys are rate-limited</h4>
          <p className="text-sm mt-1">
            Next key available in <span className="font-bold text-red-400">{status.nextAvailableIn}s</span>
          </p>
          <p className="text-xs mt-2 text-red-400/70">
            Chat requests will queue and retry automatically once a key becomes available.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Token Bucket Manager</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Smart API key rotation with automatic cooldown tracking
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-[#20B9BE] text-white font-semibold disabled:opacity-50 transition-all"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {/* Rate limit alert */}
      {rateLimitAlert}

      {!status ? (
        <div className="text-center py-8 text-[#94A3B8]">Loading token bucket status...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Available</div>
              <div className="text-3xl font-black mt-2" style={{ color: '#20B9BE' }}>
                {status.availableCount}/{status.totalKeys}
              </div>
              <p className="text-[10px] text-[#64748B] mt-2">
                {status.allCoolingDown ? 'All cooling down' : `${status.availableCount} key${status.availableCount !== 1 ? 's' : ''} ready`}
              </p>
            </div>

            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Next Available</div>
              <div className="text-3xl font-black mt-2" style={{ color: status.allCoolingDown ? '#f87171' : '#10b981' }}>
                {status.allCoolingDown ? `${status.nextAvailableIn}s` : 'Now'}
              </div>
              <p className="text-[10px] text-[#64748B] mt-2">Time until next key available</p>
            </div>

            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Auto Refresh</div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-5 h-5 rounded accent-[#20B9BE]"
                />
                <span className="text-white font-semibold">Every 3 seconds</span>
              </label>
            </div>
          </div>

          {/* Keys table */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span>🔑</span> API Keys ({status.keys.length})
              </h3>
            </div>

            <div className="divide-y divide-[#1E293B]">
              {status.keys.map((key) => (
                <div key={key.index} className="p-4 hover:bg-[#1E293B]/30 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-[#94A3B8] uppercase">Key #{key.index}</span>
                        <span className="font-mono text-sm text-[#64748B]">{key.masked}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-[9px] font-bold border ${
                            key.available
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                          }`}
                        >
                          {key.available ? '✓ Available' : `⏳ Cooldown ${key.cooldownSeconds}s`}
                        </span>
                        {key.cooldownReason && (
                          <span className="text-[9px] text-[#94A3B8] ml-2">({key.cooldownReason})</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-6 text-xs text-[#64748B]">
                        <span>✓ Successes: <span className="font-bold text-emerald-400">{key.successCount}</span></span>
                        <span>✗ Failures: <span className="font-bold text-red-400">{key.failureCount}</span></span>
                      </div>
                    </div>

                    {key.cooldownSeconds > 0 && (
                      <div className="ml-4 text-right">
                        <div
                          className="text-2xl font-black"
                          style={{
                            color: key.cooldownSeconds > 30 ? '#f87171' : key.cooldownSeconds > 10 ? '#fbbf24' : '#10b981',
                          }}
                        >
                          {key.cooldownSeconds}s
                        </div>
                        <div className="w-32 h-2 bg-[#1E293B] rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full transition-all ${
                              key.cooldownSeconds > 30
                                ? 'bg-red-500'
                                : key.cooldownSeconds > 10
                                ? 'bg-yellow-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${((65 - key.cooldownSeconds) / 65) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <span>ℹ️</span> How It Works
            </h3>
            <div className="space-y-3 text-sm text-[#94A3B8]">
              <p>
                <span className="font-semibold text-white">Smart Rotation:</span> Keys are tried in round-robin order, skipping any in cooldown.
              </p>
              <p>
                <span className="font-semibold text-white">Automatic Cooldown:</span> When a key hits rate-limit (429), it enters a 65-second cooldown. Other keys continue serving requests.
              </p>
              <p>
                <span className="font-semibold text-white">Self-Healing:</span> Once cooldown expires, the key is automatically re-admitted to the active pool.
              </p>
              <p>
                <span className="font-semibold text-white">No Service Interruption:</span> Chat requests queue and retry automatically—users never see failures.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
