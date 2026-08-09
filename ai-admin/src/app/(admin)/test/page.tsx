'use client';
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';

// Simple UUID generator without external dependency
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: any[];
  sources?: any[];
  createdAt: string;
}

interface ToolCall {
  tool: string;
  input: any;
  status: 'running' | 'completed';
  result?: any;
}

const PRESET_QUERIES = [
  "Show me SUVs available in Sydney this weekend",
  "What is the cancellation policy?",
  "How much is delivery?",
  "Tell me about the SUMMER25 voucher",
  "What are late fees?",
];

// ── Key Attempts Status Bar ───────────────────────────────────────────────────

function KeyAttemptsBar({ attempts }: {
  attempts: Array<{ keyMasked: string; keyIndex: number; keyTotal: number; status: string; rateLimit?: boolean }>;
}) {
  if (attempts.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1 py-1.5">
      <span className="text-[9px] font-bold text-[#475569] uppercase tracking-wider mr-1">Keys:</span>
      {attempts.map((k) => (
        <span
          key={k.keyIndex}
          title={k.rateLimit ? 'Rate limited' : k.status === 'failed' ? 'Error' : k.status === 'success' ? 'Used successfully' : 'Trying...'}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${
            k.status === 'failed'
              ? 'bg-red-500/15 text-red-400 border-red-500/30 line-through'
              : k.status === 'success'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 animate-pulse'
          }`}
        >
          {k.status === 'trying'  && '⟳'}
          {k.status === 'failed'  && '✗'}
          {k.status === 'success' && '✓'}
          {' '}#{k.keyIndex} {k.keyMasked}
          {k.rateLimit && ' (429)'}
        </span>
      ))}
    </div>
  );
}

// ── Live Key Status Component ────────────────────────────────────────────────

function LiveKeyStatusPanel({ status }: {
  status: { keys: any[], availableCount: number, totalKeys: number, allCoolingDown: boolean, nextAvailableIn: number } | null;
}) {
  if (!status) return null;

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#0a1628] border border-[#1E293B] rounded-lg p-2.5">
          <div className="text-[9px] text-[#94A3B8] uppercase font-bold">Available</div>
          <div className="text-2xl font-black mt-1" style={{ color: '#20B9BE' }}>
            {status.availableCount}/{status.totalKeys}
          </div>
        </div>
        <div className="bg-[#1a0a0a] border border-[#1E293B] rounded-lg p-2.5">
          <div className="text-[9px] text-[#94A3B8] uppercase font-bold">Next Available</div>
          <div className="text-2xl font-black mt-1" style={{ color: status.allCoolingDown ? '#f87171' : '#10b981' }}>
            {status.allCoolingDown ? `${status.nextAvailableIn}s` : 'Now'}
          </div>
        </div>
      </div>

      {/* Keys list */}
      <div className="space-y-1.5">
        {status.keys.map((k: any) => (
          <div key={k.index} className={`rounded-lg border p-2.5 text-[10px] ${
            k.available
              ? 'bg-[#0a1628] border-[#1E293B]'
              : 'bg-[#1a0a0a] border-red-900/40'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-bold text-[#94A3B8]">Key #{k.index} {k.masked}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                k.available
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 border-red-500/30'
              }`}>
                {k.available ? '✓ Ready' : '⏳ Cooldown'}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-[9px] text-[#64748B] mb-1.5">
              <span>✓ {k.successCount} success</span>
              <span>✗ {k.failureCount} fail</span>
            </div>

            {/* Cooldown bar */}
            {k.cooldownSeconds > 0 && (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-bold text-red-400">{k.cooldownReason || 'Unknown'}</span>
                  <span className="text-[9px] font-bold text-red-400">{k.cooldownSeconds}s</span>
                </div>
                <div className="w-full h-1.5 bg-[#0F161E] rounded-full overflow-hidden border border-red-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
                    style={{
                      width: `${((65 - k.cooldownSeconds) / 65) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderStatusPanel({ backendUrl }: { backendUrl: string }) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Use relative URL — goes through Next.js rewrite proxy, no CORS issue
      const res = await apiFetch('/api/ai/test/provider-status');
      if (res.ok) {
        setData(await res.json());
        setLastRefresh(new Date());
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const circuitBadge = (circuit: any) => {
    if (!circuit || !circuit.open) return null;
    const secsLeft = Math.max(0, Math.round((60000 - (Date.now() - circuit.openedAt)) / 1000));
    return (
      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
        OPEN {secsLeft}s
      </span>
    );
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#475569]">Auto-refreshes on open</span>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] px-2 py-1 rounded bg-[#1E293B] text-[#94A3B8] hover:text-white border border-[#334155] transition-all disabled:opacity-50"
        >
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {/* Per-provider rows */}
      {(data?.providers ?? []).map((p: any) => (
        <div key={p.name} className={`rounded-xl border p-2.5 ${
          p.available ? 'bg-[#0a1628] border-[#1E293B]' : 'bg-[#1a0a0a] border-red-900/30'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-white">{p.label}</span>
            <div className="flex items-center gap-1">
              {p.available
                ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ {p.keys} key{p.keys !== 1 ? 's' : ''}</span>
                : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/20 text-gray-500 border border-gray-500/30">Not configured</span>
              }
              {circuitBadge(p.circuit)}
            </div>
          </div>
          <div className="text-[10px] text-[#64748B] font-mono">{p.model}</div>
          <div className="text-[9px] text-[#475569] mt-0.5">{p.costPer1M}</div>
          {p.circuit?.lastError && (
            <div className="text-[9px] text-red-400/70 mt-1 truncate" title={p.circuit.lastError}>
              ⚠ {p.circuit.lastError.slice(0, 60)}
            </div>
          )}
        </div>
      ))}

      {/* Groq key pool */}
      {(data?.groqKeys ?? []).length > 0 && (
        <div className="pt-1 border-t border-[#1E293B]">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">Groq Key Pool</p>
          <div className="space-y-1">
            {data.groqKeys.map((k: any) => (
              <div key={k.index} className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-[#475569]">Key #{k.index}</span>
                <span className="font-mono text-[#64748B]">{k.masked}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastRefresh && (
        <p className="text-[9px] text-[#334155] text-right pt-1">
          Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </div>
  );
}

interface VehicleProps {
  id?: string | number;
  make?: string;
  model?: string;
  year?: number;
  dailyRate?: number;
  seats?: number;
  transmission?: string;
  imageUrl?: string;
  type?: string;
  remaining?: number;
  searchUrl?: string;
}

function TestVehicleCard({ vehicle }: { vehicle: VehicleProps }) {
  if (vehicle.type === 'view_more') {
    const handleViewMore = () => {
      const targetUrl = vehicle.searchUrl 
        ? (vehicle.searchUrl.startsWith('http') ? vehicle.searchUrl : `https://dev-testing.tashus.com${vehicle.searchUrl}`)
        : 'https://dev-testing.tashus.com/search';
      window.open(targetUrl, '_blank');
    };

    return (
      <div className="w-[180px] min-w-[180px] bg-[#0F161E] border border-dashed border-[#F2994A]/40 rounded-xl overflow-hidden shadow-md my-2 flex flex-col items-center justify-center text-center p-3 h-[240px]">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[#F2994A]/10 border border-[#F2994A]/30 flex items-center justify-center text-[#F2994A] text-base font-black mb-2 animate-pulse">
            +{vehicle.remaining ?? 0}
          </div>
          <h4 className="font-bold text-white text-xs mb-1">More Vehicles</h4>
          <p className="text-[9px] text-[#94A3B8] leading-relaxed px-1">
            See all matching results on Tashus
          </p>
        </div>

        <button
          onClick={handleViewMore}
          className="w-full mt-2 bg-[#F2994A] hover:bg-[#d97f2e] text-white text-[10px] font-bold py-1.5 rounded-lg transition-all text-center uppercase tracking-wider shadow-md shadow-[#F2994A]/5"
        >
          View All
        </button>
      </div>
    );
  }

  const handleViewDetails = () => {
    const targetUrl = `https://dev-testing.tashus.com/search/${vehicle.id}/vehicle-details`;
    window.open(targetUrl, '_blank');
  };

  const formattedRate = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(vehicle.dailyRate ?? 0);

  return (
    <div className="w-[180px] min-w-[180px] bg-[#0F161E] border border-[#334155] rounded-xl overflow-hidden shadow-md my-2 flex flex-col text-left h-[240px] hover:border-[#20B9BE]/60 transition-all">
      {vehicle.imageUrl ? (
        <img
          src={vehicle.imageUrl}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="w-full h-24 object-cover bg-[#090D11]"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60';
          }}
        />
      ) : (
        <div className="w-full h-24 bg-[#090D11] flex items-center justify-center text-[10px] text-[#94A3B8]">
          No Image
        </div>
      )}
      
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="font-bold text-white text-[11px] leading-snug truncate">
            {vehicle.make} {vehicle.model}
          </h4>
          {vehicle.year ? (
            <span className="text-[9px] text-[#94A3B8] font-normal">({vehicle.year})</span>
          ) : null}

          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] font-bold text-[#20B9BE] whitespace-nowrap">{formattedRate}/day</span>
          </div>

          <div className="flex items-center gap-2 text-[9px] text-[#94A3B8] mt-1 font-semibold">
            <span>👤 {vehicle.seats}</span>
            <span>⚙ {vehicle.transmission}</span>
          </div>
        </div>

        <button
          onClick={handleViewDetails}
          className="w-full mt-2 bg-[#F2994A] hover:bg-[#d97f2e] text-white text-[9px] font-bold py-1.5 rounded-lg transition-all text-center uppercase tracking-wider shadow-md shadow-[#F2994A]/5"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

function parseRichContent(text: string) {
  if (!text) return null;

  const regex = /\[(VEHICLE|VOUCHER):\s*(\{.*?\})\]/g;  // Note: 's' flag not needed — dots in JSON don't span newlines
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    
    if (matchIndex > lastIndex) {
      parts.push({
        type: 'text',
        val: text.substring(lastIndex, matchIndex)
      });
    }

    try {
      const type = match[1];
      const payload = JSON.parse(match[2]);
      parts.push({
        type: type.toLowerCase(),
        val: payload
      });
    } catch (err) {
      parts.push({
        type: 'text',
        val: match[0]
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      val: text.substring(lastIndex)
    });
  }

  if (parts.length === 0) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const groupedParts = [];
  let currentVehicleGroup = [];

  for (const p of parts) {
    if (p.type === 'vehicle') {
      currentVehicleGroup.push(p.val);
    } else if (p.type === 'text' && p.val.trim() === '') {
      // Skip whitespace-only text parts to keep consecutive vehicles grouped together
      continue;
    } else {
      if (currentVehicleGroup.length > 0) {
        groupedParts.push({
          type: 'vehicle_group',
          val: currentVehicleGroup
        });
        currentVehicleGroup = [];
      }
      groupedParts.push(p);
    }
  }
  if (currentVehicleGroup.length > 0) {
    groupedParts.push({
      type: 'vehicle_group',
      val: currentVehicleGroup
    });
  }

  return (
    <div className="space-y-2 w-full">
      {groupedParts.map((p, idx) => {
        if (p.type === 'text') {
          return <span key={idx} className="whitespace-pre-wrap block text-sm leading-relaxed">{p.val}</span>;
        } else if (p.type === 'vehicle_group') {
          return (
            <div 
              key={idx} 
              className="flex flex-row flex-nowrap overflow-x-auto gap-3 py-1.5 w-full snap-x snap-mandatory scroll-smooth select-none"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {p.val.map((vehicle: any, vIdx: number) => (
                <div key={vIdx} className="w-[180px] min-w-[180px] max-w-[180px] flex-shrink-0 snap-start">
                  <TestVehicleCard vehicle={vehicle} />
                </div>
              ))}
            </div>
          );
        } else if (p.type === 'voucher') {
          return (
            <div key={idx} className="my-2 p-3 bg-gradient-to-r from-[#20B9BE]/10 to-transparent border border-[#20B9BE]/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">PROMO VOUCHER</p>
                <h4 className="font-bold text-white text-sm mt-0.5">{p.val.code || p.val.slug?.toUpperCase()}</h4>
                <p className="text-xs text-[#20B9BE] font-semibold mt-1">{p.val.discountText || 'Discount active'}</p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded bg-[#20B9BE]/20 text-[#20B9BE] font-bold text-xs border border-[#20B9BE]/30 uppercase tracking-widest animate-pulse">
                  ACTIVE
                </span>
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

const TEST_DISABLED = true;

export default function TestChatPage() {
  const [testSessionId, setTestSessionId] = useState('test:session');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [showContext, setShowContext] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [showTools, setShowTools] = useState(false);
  const [toolsData, setToolsData] = useState<any>(null);
  const [showApiKeys, setShowApiKeys] = useState(true);
  const [showTestInfo, setShowTestInfo] = useState(false);
  const [showProviders, setShowProviders] = useState(true);
  // Live key attempt tracking — shows which key is being tried per message
  const [keyAttempts, setKeyAttempts] = useState<Array<{
    keyMasked: string; keyIndex: number; keyTotal: number;
    status: 'trying' | 'failed' | 'success'; rateLimit?: boolean;
  }>>([]);
  // v3.1.0: Live key status from token bucket — shows cooldown timers per key
  const [liveKeyStatus, setLiveKeyStatus] = useState<any>(null);
  const [keyTimers, setKeyTimers] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (TEST_DISABLED) return;
    scrollToBottom();
  }, [messages, streamingContent]);

  // v3.1.0: Fetch live token bucket status every 2s
  useEffect(() => {
    if (TEST_DISABLED) return;
    const fetchKeyStatus = async () => {
      try {
        const res = await apiFetch('/api/admin/token-bucket');
        if (res.ok) {
          const data = await res.json();
          setLiveKeyStatus(data);
          // Build cooldown timers map
          const timers: Record<string, number> = {};
          data.keys?.forEach((k: any) => {
            if (k.cooldownSeconds > 0) {
              timers[k.masked] = k.cooldownSeconds;
            }
          });
          setKeyTimers(timers);
        }
      } catch (err) {
        console.error('Failed to fetch key status:', err);
      }
    };
    fetchKeyStatus();
    const interval = setInterval(fetchKeyStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (TEST_DISABLED) return;
    setTestSessionId(`test:${generateId()}`);
  }, []);

  if (TEST_DISABLED) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <div className="text-center max-w-md bg-[#0F161E] border border-[#1E293B] p-8 rounded-2xl">
          <div className="text-6xl mb-6">🚧</div>
          <h2 className="text-2xl font-bold text-white mb-3">Test Console Disabled</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            The test chat console is currently disabled. It will be re-enabled for development and debugging use only.
          </p>
        </div>
      </div>
    );
  }

  const handleSendMessage = async (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText || isLoading) return;

    // Add user message to display
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: messageText,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');
    setCurrentToolCalls([]);
    setSources([]);
    setKeyAttempts([]);  // reset key tracking for new message

    try {
      // Call streaming endpoint
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3000'}/api/ai/test/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            testSessionId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let toolCalls: ToolCall[] = [];
      let eventSources: any[] = [];
      let isError = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let i = 0;
          while (i < lines.length) {
            const line = lines[i];

            if (line.startsWith('event: ')) {
              const eventType = line.slice(7).trim();
              // Next line should be data
              if (i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
                const dataStr = lines[i + 1].slice(6).trim();
                try {
                  const data = JSON.parse(dataStr);

                  if (eventType === 'token') {
                    assistantContent += (data.token || data.delta || '');
                    setStreamingContent(assistantContent);
                  } else if (eventType === 'tool_start') {
                    toolCalls = [...toolCalls, {
                      tool: data.tool,
                      input: data.input,
                      status: 'running',
                    }];
                    setCurrentToolCalls(toolCalls);
                  } else if (eventType === 'tool_result') {
                    toolCalls = toolCalls.map(t => t.tool === data.tool ? { ...t, status: 'completed', result: data.result } : t);
                    setCurrentToolCalls(toolCalls);
                  } else if (eventType === 'key_attempt') {
                    setKeyAttempts(prev => {
                      const exists = prev.find(k => k.keyIndex === data.keyIndex);
                      if (exists) return prev;
                      return [...prev, {
                        keyMasked: data.keyMasked,
                        keyIndex: data.keyIndex,
                        keyTotal: data.keyTotal,
                        status: 'trying',
                      }];
                    });
                  } else if (eventType === 'key_failed') {
                    setKeyAttempts(prev => {
                      const existing = prev.find(k => k.keyIndex === data.keyIndex);
                      if (existing) {
                        return prev.map(k =>
                          k.keyIndex === data.keyIndex
                            ? { ...k, status: 'failed', rateLimit: data.rateLimit }
                            : k
                        );
                      }

                      return [...prev, {
                        keyMasked: data.keyMasked || `key-${data.keyIndex}`,
                        keyIndex: data.keyIndex,
                        keyTotal: data.keyTotal || 1,
                        status: 'failed',
                        rateLimit: data.rateLimit,
                      }];
                    });
                  } else if (eventType === 'done') {
                    // Mark last non-failed key as success
                    setKeyAttempts(prev => prev.map((k, i) =>
                      i === prev.length - 1 && k.status === 'trying' ? { ...k, status: 'success' } : k
                    ));
                    eventSources = data.sources || [];
                    setSources(eventSources);
                  } else if (eventType === 'error') {
                    console.error('Stream error:', data.error);
                    assistantContent += `\n\n❌ Error: ${data.error}`;
                    isError = true;
                  }
                } catch (e) {
                  console.error('Failed to parse event data:', e, dataStr);
                }
                i += 2; // Skip the data line
              } else {
                i += 1;
              }
            } else {
              i += 1;
            }
          }
        }
      }

      // Add assistant message with final content
      if (assistantContent) {
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: assistantContent,
          toolCalls: toolCalls,
          sources: eventSources,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        setStreamingContent('');
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      const errorMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `❌ Error: ${err.message}`,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspectContext = async () => {
    if (!inputValue.trim()) return;
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3000'}/api/ai/test/context`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: inputValue.trim() }),
        }
      );
      const data = await response.json();
      setContextData(data);
      setShowContext(true);
    } catch (err: any) {
      console.error('Error inspecting context:', err);
    }
  };

  const handleLoadTools = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3000'}/api/ai/test/tools`
      );
      const data = await response.json();
      setToolsData(data);
      setShowTools(true);
    } catch (err: any) {
      console.error('Error loading tools:', err);
    }
  };

  const handleClearSession = async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3000'}/api/ai/test/messages?testSessionId=${testSessionId}`,
        { method: 'DELETE' }
      );
      setMessages([]);
      setStreamingContent('');
      setCurrentToolCalls([]);
      setSources([]);
    } catch (err: any) {
      console.error('Error clearing session:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_360px] gap-6 h-[calc(100vh-8rem)] min-h-0">
      {/* Main Chat Area */}
      <div className="flex flex-col min-h-0 bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-6 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">AI Agent Test Console</h1>
              <p className="text-sm text-[#94A3B8] mt-1">Test the chat AI agent and inspect responses</p>
            </div>
            <button
              onClick={handleClearSession}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
            >
              Clear Session
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#64748B]">
            <span className="w-2 h-2 rounded-full bg-[#20B9BE] animate-pulse" />
            <span>Session ID: {testSessionId.substring(0, 12)}...</span>
          </div>
          {/* Live key attempts bar — shows during and after each message */}
          {keyAttempts.length > 0 && (
            <div className="mt-2 border-t border-[#1E293B] pt-2">
              <KeyAttemptsBar attempts={keyAttempts} />
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-[#20B9BE] text-4xl mb-4">💬</div>
                <p className="text-[#64748B] font-medium">Start a test conversation</p>
                <p className="text-xs text-[#475569] mt-2">Messages appear here as you chat</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}
            >
              <div
                className={`px-4 py-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'max-w-xs lg:max-w-md xl:max-w-lg bg-[#20B9BE] text-white'
                    : 'w-full max-w-full md:max-w-[85%] bg-[#1E293B] text-[#E4E6EB] border border-[#334155]'
                }`}
              >
                {parseRichContent(msg.content)}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.toolCalls.map((tc, idx) => (
                      <div key={idx} className="text-xs bg-black/30 p-2 rounded border border-[#475569]">
                        <span className="font-semibold">🔧 {tc.tool}</span>
                        {tc.status === 'completed' && <span className="text-green-400"> ✓</span>}
                      </div>
                    ))}
                  </div>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 text-xs text-[#94A3B8]">
                    Sources: {msg.sources.length} references
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (keyAttempts.length > 0 || streamingContent) && (
            <div className="flex justify-start w-full">
              <div className="w-full max-w-full md:max-w-[85%] px-4 py-3 rounded-lg bg-[#1E293B] text-[#E4E6EB] border border-[#334155]">
                {/* Show key attempts while waiting for response */}
                {!streamingContent && keyAttempts.length > 0 && (
                  <div className="mb-2">
                    <KeyAttemptsBar attempts={keyAttempts} />
                  </div>
                )}
                {streamingContent && parseRichContent(streamingContent)}
                <div className="mt-2 flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#20B9BE] animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-[#20B9BE] animate-pulse" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-[#20B9BE] animate-pulse" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-[#1E293B] bg-[#0F161E]">
          {/* Preset Queries */}
          <div className="mb-4">
            <p className="text-xs text-[#64748B] font-semibold mb-2">Quick test queries:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_QUERIES.slice(0, 3).map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(query)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1 rounded-lg bg-[#1E293B] text-[#94A3B8] hover:text-white hover:bg-[#334155] transition-all disabled:opacity-50"
                >
                  {query.substring(0, 30)}...
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask a test question..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-[#1E293B] border border-[#334155] rounded-lg text-white placeholder-[#64748B] focus:outline-none focus:border-[#20B9BE] focus:ring-1 focus:ring-[#20B9BE] transition-all disabled:opacity-50"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputValue.trim()}
              className="px-4 py-3 bg-[#20B9BE] text-white rounded-lg font-semibold hover:bg-[#20B9BE]/90 disabled:opacity-50 transition-all"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Panels */}
      <div className="space-y-4 min-h-0 overflow-y-auto pr-1 lg:pb-2">
        {/* Context Inspector */}
        <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
          <button
            onClick={() => setShowContext(!showContext)}
            className="w-full p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent flex items-center justify-between hover:bg-[#20B9BE]/10 transition-all"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <span>🔍</span> RAG Context
            </h3>
            <span className="text-[#64748B]">{showContext ? '−' : '+'}</span>
          </button>
          {showContext && (
            <div className="p-4 max-h-96 overflow-y-auto">
              {contextData ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#20B9BE] mb-1">KB Entries: {contextData.kbEntries?.length || 0}</p>
                    <div className="space-y-1">
                      {contextData.kbEntries?.slice(0, 3).map((kb: any, idx: number) => (
                        <div key={idx} className="p-2 bg-[#1E293B] rounded border-l-2 border-[#20B9BE]">
                          <p className="font-medium text-[#E4E6EB]">{kb.question}</p>
                          <p className="text-[#94A3B8] mt-1">{kb.answer?.substring(0, 60)}...</p>
                          <p className="text-[#64748B] mt-1">Similarity: {(kb.similarity * 100).toFixed(1)}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-[#20B9BE] mb-1">Doc Chunks: {contextData.documentChunks?.length || 0}</p>
                    <div className="space-y-1">
                      {contextData.documentChunks?.slice(0, 2).map((chunk: any, idx: number) => (
                        <div key={idx} className="p-2 bg-[#1E293B] rounded border-l-2 border-[#F2994A]">
                          <p className="font-medium text-[#E4E6EB]">{chunk.documentTitle} (p.{chunk.pageNumber})</p>
                          <p className="text-[#94A3B8] mt-1">{chunk.content?.substring(0, 50)}...</p>
                          <p className="text-[#64748B] mt-1">Similarity: {(chunk.similarity * 100).toFixed(1)}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleInspectContext}
                  disabled={!inputValue.trim()}
                  className="w-full px-3 py-2 bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE] rounded hover:bg-[#20B9BE]/20 transition-all text-sm font-semibold disabled:opacity-50"
                >
                  Inspect Query Context
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tools Inspector */}
        <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
          <button
            onClick={() => setShowTools(!showTools)}
            className="w-full p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent flex items-center justify-between hover:bg-[#20B9BE]/10 transition-all"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <span>🔧</span> Available Tools
            </h3>
            <span className="text-[#64748B]">{showTools ? '−' : '+'}</span>
          </button>
          {showTools && (
            <div className="p-4 max-h-96 overflow-y-auto">
              {toolsData ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#1E293B]">
                    <span className="text-[#64748B]">Enabled Tools</span>
                    <span className="font-bold text-[#20B9BE]">{toolsData.enabledCount}/{toolsData.totalTools}</span>
                  </div>
                  {toolsData.tools?.map((tool: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border ${
                        tool.enabled
                          ? 'bg-green-500/10 border-green-500/20'
                          : 'bg-[#1E293B] border-[#334155]'
                      }`}
                    >
                      <p className="font-semibold text-white flex items-center gap-2">
                        {tool.enabled ? '✓' : '✗'} {tool.name}
                      </p>
                      <p className="text-[#94A3B8] mt-1">{tool.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={handleLoadTools}
                  className="w-full px-3 py-2 bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE] rounded hover:bg-[#20B9BE]/20 transition-all text-sm font-semibold"
                >
                  Load Tool Registry
                </button>
              )}
            </div>
          )}
        </div>

        {/* API Key Status — collapsible */}
        {/* <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="w-full p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent flex items-center justify-between hover:bg-[#20B9BE]/10 transition-all"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <span>🔐</span> API Key Status
            </h3>
            <span className="text-[#64748B]">{showApiKeys ? '−' : '+'}</span>
          </button>
          {showApiKeys && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                <span>Live key usage for the current run</span>
                <span className="font-semibold text-[#20B9BE]">{keyAttempts.length} tracked</span>
              </div>

              {keyAttempts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#334155] p-3 text-[11px] text-[#64748B]">
                  No API key activity yet. Keys will appear here as the agent tries them.
                </div>
              ) : (
                <div className="space-y-2">
                  {keyAttempts.map((attempt) => {
                    const statusTone = attempt.status === 'trying'
                      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                      : attempt.status === 'success'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/15 text-red-400 border-red-500/30';

                    const statusText = attempt.rateLimit
                      ? 'Rate limited'
                      : attempt.status === 'trying'
                      ? 'Trying now'
                      : attempt.status === 'success'
                      ? 'Used successfully'
                      : 'Failed';

                    return (
                      <div key={`${attempt.keyIndex}-${attempt.keyMasked}`} className="rounded-lg border border-[#1E293B] bg-[#111827] p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-semibold text-white">#{attempt.keyIndex} {attempt.keyMasked}</p>
                            <p className="text-[10px] text-[#64748B] mt-0.5">{attempt.keyTotal} key{attempt.keyTotal !== 1 ? 's' : ''} in pool</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusTone}`}>
                            {statusText}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isLoading && keyAttempts.length > 0 && (
                <div className="rounded-lg border border-[#20B9BE]/20 bg-[#20B9BE]/10 p-2 text-[10px] text-[#20B9BE]">
                  Current run is active and key status updates in real time.
                </div>
              )}
            </div>
          )}
        </div> */}

        {/* Test Info — collapsible */}
        <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
          <button
            onClick={() => setShowTestInfo(!showTestInfo)}
            className="w-full p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent flex items-center justify-between hover:bg-[#20B9BE]/10 transition-all"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <span>ℹ️</span> Test Info
            </h3>
            <span className="text-[#64748B]">{showTestInfo ? '−' : '+'}</span>
          </button>
          {showTestInfo && (
            <div className="p-4">
              <div className="space-y-2 text-xs text-[#94A3B8]">
                <p><span className="font-semibold text-white">Mode:</span> Test (ephemeral)</p>
                <p><span className="font-semibold text-white">Messages:</span> {messages.length}</p>
                <p><span className="font-semibold text-white">Session TTL:</span> 1 hour</p>
                <p className="font-mono text-[9px] text-[#475569] break-all">ID: {testSessionId}</p>
                <div className="mt-3 p-3 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                  <p className="font-semibold mb-1">💡 Tips:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Use preset queries for quick testing</li>
                    <li>Inspect RAG context to debug retrieval</li>
                    <li>Check enabled tools before testing</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LLM Provider Status — collapsible */}
        <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
          <button
            onClick={() => setShowProviders(!showProviders)}
            className="w-full p-4 border-b border-[#1E293B] bg-gradient-to-r from-[#20B9BE]/5 to-transparent flex items-center justify-between hover:bg-[#20B9BE]/10 transition-all"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <span>🔑</span> API Key Status
            </h3>
            <span className="text-[#64748B]">{showProviders ? '−' : '+'}</span>
          </button>
          {showProviders && (
            <div className="p-0">
              <LiveKeyStatusPanel status={liveKeyStatus} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
