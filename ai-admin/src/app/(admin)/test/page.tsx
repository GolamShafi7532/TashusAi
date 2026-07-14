'use client';

import React, { useState, useRef, useEffect } from 'react';

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

  const regex = /\[(VEHICLE|VOUCHER):\s*(\{.*?\})\]/gs;
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

export default function TestChatPage() {
  const [testSessionId] = useState(() => `test:${generateId()}`);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

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
                  } else if (eventType === 'done') {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Main Chat Area */}
      <div className="lg:col-span-2 flex flex-col bg-[#0F161E] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl">
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
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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

          {isLoading && streamingContent && (
            <div className="flex justify-start w-full">
              <div className="w-full max-w-full md:max-w-[85%] px-4 py-3 rounded-lg bg-[#1E293B] text-[#E4E6EB] border border-[#334155]">
                {parseRichContent(streamingContent)}
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
      <div className="space-y-4">
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

        {/* Test Info */}
        <div className="bg-[#0F161E] rounded-2xl border border-[#1E293B] p-4">
          <h3 className="font-bold text-white mb-3 flex items-center gap-2">
            <span>ℹ️</span> Test Info
          </h3>
          <div className="space-y-2 text-xs text-[#94A3B8]">
            <p><span className="font-semibold">Mode:</span> Test (ephemeral)</p>
            <p><span className="font-semibold">Messages:</span> {messages.length}</p>
            <p><span className="font-semibold">Session TTL:</span> 1 hour</p>
            <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <p className="font-semibold mb-1">💡 Tips:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Use preset queries for quick testing</li>
                <li>Inspect RAG context to debug retrieval</li>
                <li>Check enabled tools before testing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
