'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
const AVAILABLE_TOOLS = [
  { name: 'search_vehicles', description: 'Search available vehicles by criteria' },
  { name: 'check_availability', description: 'Check vehicle availability for specific dates' },
  { name: 'validate_voucher', description: 'Validate promotional voucher codes' },
  { name: 'search_knowledge_base', description: 'Search KB for policy/FAQ answers' },
  { name: 'get_vehicle_details', description: 'Retrieve detailed vehicle listing info' },
  { name: 'get_user_bookings', description: 'Retrieve user booking history (read-only)' },
];

const CONFIG_DISABLED = true;

export default function AgentConfigPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('claude-3-5-sonnet-20240620');
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);

  const fetchConfig = async () => {
    try {
      const res = await apiFetch('/api/admin/config/agent', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const cfg = data.config;
          setConfig(cfg);
          setSystemPrompt(cfg.system_prompt || '');
          setModel(cfg.model || 'claude-3-5-sonnet-20240620');
          setTemperature(cfg.temperature ?? 0.3);
          setMaxTokens(cfg.max_tokens ?? 1024);
          setEnabledTools(cfg.enabled_tools || []);
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const toggleTool = (toolName: string) => {
    if (CONFIG_DISABLED) return;
    setEnabledTools((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (CONFIG_DISABLED) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch('/api/admin/config/agent', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          model,
          temperature,
          max_tokens: maxTokens,
          enabled_tools: enabledTools,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      setConfig(data.config);
      setSuccess('Agent configuration saved and live! Redis cache has been cleared.');
    } catch (err) {
      setError('Connection error during save');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="bg-[#0F161E] p-5 rounded-2xl border border-[#1E293B]">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#20B9BE]/10 rounded-xl border border-[#20B9BE]/20 text-[#20B9BE]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white text-base">AI Agent Configuration</h3>
            <p className="text-xs text-[#94A3B8]">Changes take effect within 60 seconds (Redis cache TTL)</p>
          </div>
        </div>
        {config && (
          <div className="mt-3 pt-3 border-t border-[#1E293B] text-[10px] font-mono text-[#94A3B8]">
            Last updated: {new Date(config.updated_at).toLocaleString()} • Config key: <span className="text-white">{config.config_key}</span>
          </div>
        )}
      </div>

      {CONFIG_DISABLED && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-3">
          <span className="text-xl">🔒</span>
          <div>
            <p className="font-semibold text-sm">Configuration Locked</p>
            <p className="text-xs opacity-80">Agent configuration is managed via code deployment and system environment variables. Editing via UI is disabled.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-8 w-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <fieldset disabled={CONFIG_DISABLED} className={CONFIG_DISABLED ? 'opacity-60 pointer-events-none select-none space-y-6' : 'space-y-6'}>
        <form onSubmit={handleSave} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {success}
            </div>
          )}

          {/* LLM Parameters */}
          <div className="bg-[#0F161E] p-6 rounded-2xl border border-[#1E293B] space-y-5">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#20B9BE] rounded-full" />
              LLM Parameters
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                >
                  <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                  <option value="claude-2.1">Claude 2.1 (Legacy)</option>
                  <option value="grok-3">Grok 3 (xAI)</option>
                  <option value="grok-3-mini">Grok 3 Mini (xAI)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Temperature ({temperature})
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full mt-2 accent-[#20B9BE]"
                />
                <div className="flex justify-between text-[10px] text-[#475569] mt-1">
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={256}
                  max={8192}
                  step={128}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                />
              </div>
            </div>
          </div>

          {/* System Prompt Editor */}
          <div className="bg-[#0F161E] p-6 rounded-2xl border border-[#1E293B] space-y-3">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#F2994A] rounded-full" />
              System Prompt
            </h4>
            <p className="text-xs text-[#94A3B8]">
              The system prompt is prepended to every conversation. Use <code className="text-[#20B9BE] bg-[#090D11] px-1 py-0.5 rounded text-[10px]">{'{{user_role}}'}</code> as a placeholder for the visitor role context.
            </p>
            <textarea
              required
              rows={16}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#F2994A] transition-all resize-y leading-relaxed"
              placeholder="You are Tashus AI, a helpful and knowledgeable..."
            />
            <div className="text-right text-[10px] text-[#475569] font-mono">
              {systemPrompt.length} characters · ~{Math.ceil(systemPrompt.length / 4)} tokens
            </div>
          </div>

          {/* Enabled Tools */}
          <div className="bg-[#0F161E] p-6 rounded-2xl border border-[#1E293B] space-y-4">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <span className="w-1.5 h-4 bg-purple-400 rounded-full" />
              Enabled Tools ({enabledTools.length}/{AVAILABLE_TOOLS.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_TOOLS.map((tool) => {
                const isEnabled = enabledTools.includes(tool.name);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => toggleTool(tool.name)}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      isEnabled
                        ? 'bg-[#20B9BE]/5 border-[#20B9BE]/30 text-[#20B9BE]'
                        : 'bg-[#090D11] border-[#1E293B] text-[#94A3B8] hover:border-[#334155]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center shrink-0 transition-all ${
                      isEnabled ? 'bg-[#20B9BE] border-[#20B9BE]' : 'border-[#334155]'
                    }`}>
                      {isEnabled && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className={`text-xs font-bold font-mono ${isEnabled ? 'text-white' : ''}`}>{tool.name}</p>
                      <p className="text-[10px] text-[#94A3B8] mt-0.5">{tool.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-[#20B9BE]/10 hover:shadow-[#20B9BE]/20 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving & Invalidating Cache...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Agent Configuration
                </>
              )}
            </button>
          </div>
        </form>
        </fieldset>
      )}
    </div>
  );
}
