'use strict';
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const { id: sessionId } = params;
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  // Poll for messages and session status every 2 seconds
  const fetchSessionDetails = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setMessages(data.messages || []);
      } else if (res.status === 404) {
        router.push('/sessions');
      }
    } catch (err) {
      console.error('Failed to sync session details:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionDetails(true);

    const interval = setInterval(() => {
      fetchSessionDetails(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId]);

  // Scroll to bottom on load and new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTakeover = async () => {
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/takeover`, { method: 'POST' });
      if (res.ok) {
        fetchSessionDetails(false);
      }
    } catch (err) {
      console.error('Takeover failed:', err);
    }
  };

  const handleRelease = async () => {
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/release`, { method: 'POST' });
      if (res.ok) {
        fetchSessionDetails(false);
      }
    } catch (err) {
      console.error('Release failed:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: composerText }),
      });

      if (res.ok) {
        setComposerText('');
        fetchSessionDetails(false);
      }
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <svg className="animate-spin h-8 w-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  const isPaused = session?.is_ai_paused;

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Detail Header controls */}
      <div className="px-6 py-4 border-b border-[#1E293B] bg-[#090D11]/30 flex items-center justify-between z-10">
        <div>
          <h3 className="font-bold text-white text-sm select-all">Session: {session.visitor_id || 'guest'}</h3>
          <p className="text-[10px] text-[#94A3B8] font-mono mt-0.5 select-all">ID: {session.id}</p>
        </div>

        <div className="flex items-center gap-3">
          {isPaused ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F2994A]/10 border border-[#F2994A]/20 text-[#F2994A]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F2994A] animate-pulse" />
                Handoff Mode
              </span>
              <button
                onClick={handleRelease}
                className="bg-[#20B9BE] hover:bg-[#17878b] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
              >
                Return to AI
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#20B9BE]" />
                AI Active
              </span>
              <button
                onClick={handleTakeover}
                className="bg-[#F2994A] hover:bg-[#d97f2e] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
              >
                Take Over
              </button>
            </>
          )}
        </div>
      </div>

      {/* Message list area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-[#94A3B8] py-8">No messages in this conversation.</div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';
            const isAdmin = msg.role === 'admin';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-[10px] font-semibold tracking-wider text-[#94A3B8] bg-[#1E293B]/40 px-3 py-1 rounded-lg border border-[#1E293B]">
                    {msg.content}
                  </span>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm relative ${
                  isUser
                    ? 'bg-[#20B9BE] text-white rounded-tr-none'
                    : isAdmin
                    ? 'bg-[#1F2937] text-white border-l-4 border-[#F2994A] rounded-tl-none'
                    : 'bg-[#1E293B] text-[#E4E6EB] rounded-tl-none'
                }`}>
                  <div className="flex items-center gap-2 mb-1 justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      {isAdmin ? 'Human Agent' : msg.role}
                    </span>
                    <span className="text-[9px] text-[#94A3B8]">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {/* Rendering Tool Call Audit info if present */}
                  {msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#1E293B]/50 space-y-2">
                      {msg.tool_calls.map((tool: any, idx: number) => (
                        <details key={idx} className="text-xs bg-[#090D11]/40 border border-[#1E293B] rounded-lg p-2 group cursor-pointer">
                          <summary className="font-semibold text-[#20B9BE] flex items-center justify-between select-none">
                            <span>Called Tool: {tool.name}</span>
                            <span className="text-[10px] text-[#94A3B8] font-mono group-open:hidden">▶ Expand details</span>
                            <span className="text-[10px] text-[#94A3B8] font-mono hidden group-open:inline">▼ Collapse</span>
                          </summary>
                          <div className="mt-2 space-y-1.5 font-mono text-[10px] text-[#94A3B8]">
                            <div>
                              <span className="text-white">Parameters:</span>
                              <pre className="mt-1 p-1 bg-[#090D11] rounded overflow-x-auto text-[9px]">
                                {JSON.stringify(tool.params || {}, null, 2)}
                              </pre>
                            </div>
                            {msg.tool_results && msg.tool_results[idx] !== undefined && (
                              <div>
                                <span className="text-white">Result:</span>
                                <pre className="mt-1 p-1 bg-[#090D11] rounded overflow-x-auto text-[9px]">
                                  {JSON.stringify(msg.tool_results[idx], null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Input Area */}
      <div className="p-4 border-t border-[#1E293B] bg-[#090D11]/30">
        {isPaused ? (
          <form onSubmit={handleSendMessage} className="flex gap-3 items-stretch">
            <textarea
              required
              rows={1}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              className="flex-1 bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#F2994A] transition-all resize-none max-h-24 scrollbar-none"
              placeholder="Type reply to guest..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={sending || !composerText.trim()}
              className="bg-[#F2994A] hover:bg-[#d97f2e] disabled:opacity-50 text-white rounded-xl px-5 text-sm font-semibold transition-all flex items-center justify-center shrink-0"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-center p-3 bg-[#1E293B]/20 border border-[#1E293B] rounded-xl text-xs text-[#94A3B8] font-semibold">
            AI Bot is currently active. Click &quot;Take Over&quot; above to type replies.
          </div>
        )}
      </div>
    </div>
  );
}
