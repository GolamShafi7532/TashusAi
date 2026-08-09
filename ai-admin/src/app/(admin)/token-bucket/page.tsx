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
  dbId?: string;
  source?: 'env' | 'ui';
  label?: string;
}

interface BucketStatus {
  keys: KeyStatus[];
  availableCount: number;
  totalKeys: number;
  allCoolingDown: boolean;
  nextAvailableIn: number;
}

interface DbKey {
  id: string;
  label?: string;
  masked_key: string;
  source: string;
  created_at: string;
}

export default function TokenBucketPage() {
  const [status, setStatus] = useState<BucketStatus | null>(null);
  const [dbKeys, setDbKeys] = useState<DbKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [addError, setAddError] = useState('');

  // Delete confirm state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingKeyMasked, setDeletingKeyMasked] = useState<string | null>(null);

  const fetchDbKeys = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/groq-keys');
      if (res.ok) {
        const data = await res.json();
        setDbKeys(data.keys || []);
      }
    } catch (err) {
      console.error('Failed to fetch DB keys:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [bucketRes] = await Promise.all([
        apiFetch('/api/admin/token-bucket'),
        fetchDbKeys(),
      ]);
      if (bucketRes.ok) {
        setStatus(await bucketRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch token bucket status:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchDbKeys]);

  useEffect(() => {
    refresh();
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setAddingKey(true);
    setAddError('');
    try {
      const res = await apiFetch('/api/admin/groq-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), label: newKeyLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'Failed to add API key');
        return;
      }
      setNewKey('');
      setNewKeyLabel('');
      setShowAddModal(false);
      await refresh();
    } catch (err) {
      setAddError('Network error while adding key');
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/groq-keys?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingId(null);
        setDeletingKeyMasked(null);
        await refresh();
      }
    } catch (err) {
      console.error('Delete key error:', err);
    }
  };

  // Merge status keys with dbKeys to identify UI vs ENV keys
  const allKeys = (status?.keys || []).map((k) => {
    const matchedDbKey = dbKeys.find((dk) => dk.masked_key === k.masked || dk.masked_key.slice(-6) === k.masked.slice(-6));
    return {
      ...k,
      dbId: matchedDbKey?.id,
      source: matchedDbKey ? ('ui' as const) : ('env' as const),
      label: matchedDbKey?.label,
    };
  });

  const limitedKeys = allKeys.filter((k) => !k.available || k.cooldownSeconds > 0);
  const activeKeys = allKeys.filter((k) => k.available && k.cooldownSeconds === 0);

  const rateLimitAlert = status?.allCoolingDown && (
    <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <h4 className="font-bold">All keys are rate-limited / hit daily limits</h4>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Token Bucket Manager</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Smart API key rotation with rate-limit tracking and key management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#20B9BE] hover:bg-[#17878b] text-white font-semibold flex items-center gap-2 text-sm shadow-lg shadow-[#20B9BE]/10 transition-all"
          >
            <span>+</span> Add API Key
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#0F161E] border border-[#1E293B] hover:border-[#334155] text-white font-semibold disabled:opacity-50 text-sm transition-all"
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Rate limit alert */}
      {rateLimitAlert}

      {!status ? (
        <div className="text-center py-12 text-[#94A3B8]">Loading token bucket status...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-5">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Active & Ready</div>
              <div className="text-3xl font-black mt-2 text-[#20B9BE]">
                {activeKeys.length}/{status.totalKeys}
              </div>
              <p className="text-[10px] text-[#64748B] mt-1">Ready to handle chat turns</p>
            </div>

            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-5">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Rate-Limited / Cooling</div>
              <div className="text-3xl font-black mt-2 text-red-400">
                {limitedKeys.length}
              </div>
              <p className="text-[10px] text-[#64748B] mt-1">Hit limit or cooling down</p>
            </div>

            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-5">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Next Available</div>
              <div className="text-3xl font-black mt-2" style={{ color: status.allCoolingDown ? '#f87171' : '#10b981' }}>
                {status.allCoolingDown ? `${status.nextAvailableIn}s` : 'Now'}
              </div>
              <p className="text-[10px] text-[#64748B] mt-1">Time until next key ready</p>
            </div>

            <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-5">
              <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Auto Refresh</div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#20B9BE]"
                />
                <span className="text-white font-semibold text-xs">Every 3 seconds</span>
              </label>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              TOP SECTION — Unavailable / Rate-Limited Keys
             ════════════════════════════════════════════════════════════════════ */}
          {limitedKeys.length > 0 && (
            <div className="bg-[#0F161E] border border-red-500/30 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-red-500/20 bg-red-500/10 flex items-center justify-between">
                <h3 className="font-bold text-red-400 flex items-center gap-2 text-sm">
                  <span>🔴</span> Unavailable / Rate-Limited Keys ({limitedKeys.length})
                </h3>
                <span className="text-[10px] bg-red-500/20 text-red-300 font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                  Temporary Cooldown
                </span>
              </div>

              <div className="divide-y divide-[#1E293B]">
                {limitedKeys.map((key) => (
                  <div key={key.index} className="p-4 bg-red-950/10 hover:bg-red-950/20 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#94A3B8]">Key #{key.index}</span>
                          <span className="font-mono text-xs text-white">{key.masked}</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Hit Limit / Cooling ({key.cooldownSeconds}s left)
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            key.source === 'ui' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {key.source === 'ui' ? 'UI Added' : 'ENV Var'}
                          </span>
                          {key.label && (
                            <span className="text-xs text-[#94A3B8]">({key.label})</span>
                          )}
                        </div>
                        <p className="text-xs text-red-400/90 mt-1 font-medium">
                          Reason: {key.cooldownReason || 'Rate limit threshold reached (429)'}
                        </p>
                        <div className="mt-2 flex items-center gap-6 text-xs text-[#64748B]">
                          <span>✓ Successes: <span className="font-bold text-emerald-400">{key.successCount}</span></span>
                          <span>✗ Failures: <span className="font-bold text-red-400">{key.failureCount}</span></span>
                        </div>
                      </div>

                      <div className="ml-4 flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xl font-black text-red-400">{key.cooldownSeconds}s</div>
                          <div className="w-28 h-1.5 bg-[#1E293B] rounded-full overflow-hidden mt-1 border border-red-500/30">
                            <div
                              className="h-full bg-gradient-to-r from-red-500 to-amber-500 transition-all"
                              style={{ width: `${((65 - key.cooldownSeconds) / 65) * 100}%` }}
                            />
                          </div>
                        </div>
                        {key.dbId && (
                          <button
                            onClick={() => { setDeletingId(key.dbId!); setDeletingKeyMasked(key.masked); }}
                            title="Delete API key"
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              BOTTOM SECTION — Active Keys
             ════════════════════════════════════════════════════════════════════ */}
          <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <span>🟢</span> Active & Ready API Keys ({activeKeys.length})
              </h3>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                Operational
              </span>
            </div>

            {activeKeys.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#64748B]">No active keys available right now.</div>
            ) : (
              <div className="divide-y divide-[#1E293B]">
                {activeKeys.map((key) => (
                  <div key={key.index} className="p-4 hover:bg-[#1E293B]/30 transition-all flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#94A3B8]">Key #{key.index}</span>
                        <span className="font-mono text-sm text-white">{key.masked}</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          ✓ Ready
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          key.source === 'ui' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {key.source === 'ui' ? 'UI Added' : 'ENV Var'}
                        </span>
                        {key.label && (
                          <span className="text-xs text-[#94A3B8]">({key.label})</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-6 text-xs text-[#64748B]">
                        <span>✓ Successes: <span className="font-bold text-emerald-400">{key.successCount}</span></span>
                        <span>✗ Failures: <span className="font-bold text-red-400">{key.failureCount}</span></span>
                      </div>
                    </div>

                    {key.dbId && (
                      <button
                        onClick={() => { setDeletingId(key.dbId!); setDeletingKeyMasked(key.masked); }}
                        title="Delete API key"
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ADD API KEY MODAL ────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F161E] border border-[#1E293B] w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Add Groq API Key</h3>
            <p className="text-xs text-[#94A3B8] mb-5">
              The key will be stored securely and automatically included in the rotation pool.
            </p>

            <form onSubmit={handleAddKey} className="space-y-4">
              {addError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1">API Key *</label>
                <input
                  type="password"
                  required
                  placeholder="gsk_..."
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-[#20B9BE]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1">Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Account B Key 1"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#94A3B8] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingKey || !newKey.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 text-white rounded-xl transition-all"
                >
                  {addingKey ? 'Adding...' : 'Save API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION DIALOG ───────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F161E] border border-[#1E293B] w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-base font-bold text-white mb-2">Delete API Key?</h3>
            <p className="text-xs text-[#94A3B8] mb-6">
              Are you sure you want to remove key <code className="text-white font-mono bg-[#090D11] px-1.5 py-0.5 rounded">{deletingKeyMasked}</code> from the rotation pool?
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { setDeletingId(null); setDeletingKeyMasked(null); }}
                className="px-4 py-2 text-xs font-semibold text-[#94A3B8] hover:text-white bg-[#090D11] border border-[#1E293B] rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteKey(deletingId)}
                className="px-5 py-2 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
