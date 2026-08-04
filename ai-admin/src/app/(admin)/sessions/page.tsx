'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Session {
  id: string;
  visitor_id: string;
  status: 'active' | 'handed_off' | 'closed' | 'archived';
  is_ai_paused: boolean;
  channel: string;
  last_message: string;
  message_count: number;
  last_message_at: string;
  started_at: string;
  admin_name?: string;
  assigned_admin_id?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'admin' | 'system';
  content: string;
  created_at: string;
  admin_name?: string;
  admin_email?: string;
}

interface SessionDetail {
  session: Session;
  messages: Message[];
  message_count: number;
}

interface Stats {
  active: number;
  handed_off: number;
  closed_today: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, handed_off: 0, closed_today: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'handoff'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // SSE connection
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch sessions ─────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'handoff') params.set('handoff', 'true');

      const res = await apiFetch(`/api/admin/sessions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setStats(data.stats || { active: 0, handed_off: 0, closed_today: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab]);

  // ── SSE connection for real-time notifications ─────────────────────────────
  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource('/api/admin/notifications/stream');
      eventSourceRef.current = es;

      es.addEventListener('handoff_requested', () => {
        fetchSessions(true); // Silent refresh
      });

      es.onerror = () => {
        es.close();
        retryTimerRef.current = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchSessions]);

  // ── Auto-refresh every 10 seconds ──────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => fetchSessions(true), 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // ── Initial load and tab change ────────────────────────────────────────────
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Filter sessions by search query ────────────────────────────────────────
  const filteredSessions = sessions.filter((s) =>
    s.visitor_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-8rem)] bg-[#090D11] rounded-2xl overflow-hidden border border-[#1E293B] flex min-h-0">
      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT PANEL - Session List
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="w-[280px] bg-[#0F161E] border-r border-[#1E293B] flex flex-col overflow-hidden flex-shrink-0">
        {/* Stats Strip */}
        <div className="p-4 border-b border-[#1E293B]">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#090D11] rounded-lg p-3 border border-[#1E293B]">
              <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Active</div>
              <div className="text-2xl font-bold text-[#20B9BE] mt-1">{stats.active}</div>
            </div>
            <div className="bg-[#090D11] rounded-lg p-3 border border-[#1E293B]">
              <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Handoff</div>
              <div className="text-2xl font-bold text-[#F2994A] mt-1">{stats.handed_off}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1E293B] bg-[#090D11]">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'text-[#20B9BE] border-b-2 border-[#20B9BE] bg-[#0F161E]'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            All Chats
          </button>
          <button
            onClick={() => setActiveTab('handoff')}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-all relative ${
              activeTab === 'handoff'
                ? 'text-[#F2994A] border-b-2 border-[#F2994A] bg-[#0F161E]'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Handoff
            {stats.handed_off > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-[#F2994A] text-white rounded-full animate-pulse">
                {stats.handed_off}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[#1E293B]">
          <input
            type="text"
            placeholder="Search visitor ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#090D11] border border-[#1E293B] rounded-lg px-3 py-2 text-xs text-white placeholder-[#475569] focus:outline-none focus:border-[#20B9BE]"
          />
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="animate-spin h-6 w-6 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#475569]">No sessions found</div>
          ) : (
            filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isActive={selectedSessionId === session.id}
                onClick={() => setSelectedSessionId(session.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT PANEL - Chat Detail
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedSessionId ? (
          <InlineChatPanel
            sessionId={selectedSessionId}
            onClose={() => setSelectedSessionId(null)}
            onUpdate={() => fetchSessions(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 text-[#475569] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="text-white font-semibold text-lg">Select a conversation</h3>
              <p className="text-sm text-[#94A3B8] mt-1">Choose a session from the list to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SessionCard({ session, isActive, onClick }: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  const isHandoff = session.is_ai_paused || session.status === 'handed_off';
  const isRateLimitHandoff = (session as any).metadata?.handoff_reason === 'rate_limit_exhausted';
  const avatarColor = isHandoff ? '#F2994A' : '#20B9BE';
  const avatarBg = isHandoff ? 'bg-[#F2994A]/10' : 'bg-[#20B9BE]/10';
  const avatarInitials = session.visitor_id.substring(0, 2).toUpperCase();

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-[#1E293B] cursor-pointer transition-all ${
        isActive
          ? 'bg-[rgba(32,185,190,0.1)] border-l-[3px] border-l-[#20B9BE]'
          : 'hover:bg-[#090D11]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`relative flex-shrink-0 w-10 h-10 ${avatarBg} rounded-full flex items-center justify-center text-xs font-bold`} style={{ color: avatarColor }}>
          {avatarInitials}
          {isHandoff && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#F2994A] rounded-full animate-pulse" />
          )}
          {isRateLimitHandoff && (
            <span
              title="Handoff triggered by AI rate limit — all LLM providers exhausted"
              className="absolute -bottom-0.5 -right-0.5 text-[9px] leading-none"
            >⚠️</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-white truncate">{session.visitor_id}</span>
            <span className="text-[10px] text-[#94A3B8] flex-shrink-0">{timeAgo(session.last_message_at)}</span>
          </div>
          <p className="text-xs text-[#94A3B8] line-clamp-2 mb-2">{session.last_message || 'No messages yet'}</p>
          {session.admin_name && (
            <div className="text-[10px] text-[#20B9BE] font-medium">Assigned to {session.admin_name}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE CHAT PANEL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function InlineChatPanel({ sessionId, onClose, onUpdate }: {
  sessionId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch session detail ───────────────────────────────────────────────────
  const fetchDetail = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error('Failed to fetch session detail:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [fetchDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTakeover = async () => {
    try {
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/takeover`, { method: 'POST' });
      if (res.ok) {
        await fetchDetail();
        onUpdate();
      }
    } catch (err) {
      console.error('Takeover failed:', err);
    }
  };

  const handleRelease = async () => {
    try {
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/release`, { method: 'POST' });
      if (res.ok) {
        await fetchDetail();
        onUpdate();
      }
    } catch (err) {
      console.error('Release failed:', err);
    }
  };

  const handleClose = async () => {
    try {
      await apiFetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Close failed:', err);
    }
  };

  const handleSend = async () => {
    if (!composerText.trim() || sending) return;
    setSending(true);
    const msgToSend = composerText.trim();
    setComposerText(''); // Clear immediately for better UX
    try {
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msgToSend }),
      });
      if (res.ok) {
        await fetchDetail();
        onUpdate();
      } else {
        // Restore message if send failed
        setComposerText(msgToSend);
        console.error('Send failed with status:', res.status);
      }
    } catch (err) {
      setComposerText(msgToSend); // Restore on error
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!detail) return <div className="flex-1 flex items-center justify-center text-white">Session not found</div>;

  const { session, messages } = detail;
  const isPaused = session.is_ai_paused;
  const isClosed = session.status === 'closed';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="bg-[#0F161E] border-b border-[#1E293B] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-white font-semibold text-sm">{session.visitor_id}</h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">Session {session.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Badge */}
        <div className="mb-3">
          {isPaused ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#F2994A]/10 border border-[#F2994A]/20 text-[#F2994A]">
              <span className="w-2 h-2 rounded-full bg-[#F2994A]" />
              Handoff Mode
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE]">
              <span className="w-2 h-2 rounded-full bg-[#20B9BE]" />
              AI Active
            </span>
          )}
        </div>

        {/* Action Buttons */}
        {!isClosed && (
          <div className="flex gap-2">
            {isPaused ? (
              <button
                onClick={handleRelease}
                className="flex-1 bg-[#20B9BE] hover:bg-[#1a9a9e] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
              >
                ▶ Resume AI
              </button>
            ) : (
              <button
                onClick={handleTakeover}
                className="flex-1 bg-[#F2994A] hover:bg-[#e0853d] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
              >
                Take Over
              </button>
            )}
            <button
              onClick={handleClose}
              className="bg-[#1E293B] hover:bg-[#334155] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <MsgBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {isPaused && !isClosed ? (
        <div className="bg-[#0F161E] border-t border-[#1E293B] p-4">
          <div className="flex gap-2">
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message..."
              className="flex-1 bg-[#090D11] border border-[#1E293B] rounded-lg px-4 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#20B9BE] resize-none"
              rows={3}
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!composerText.trim() || sending}
              className="self-end bg-[#20B9BE] hover:bg-[#1a9a9e] disabled:bg-[#1E293B] disabled:text-[#475569] text-white text-xs font-semibold px-6 py-2 rounded-lg transition-all"
            >
              Send
            </button>
          </div>
          <p className="text-[10px] text-[#94A3B8] mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      ) : !isPaused && !isClosed ? (
        <div className="bg-[#0F161E] border-t border-[#1E293B] p-4">
          <p className="text-sm text-[#94A3B8] text-center">
            AI is active. Click <strong>Take Over</strong> to respond manually.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function MsgBubble({ message }: { message: Message }) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-2 text-xs text-[#94A3B8] max-w-md text-center">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#20B9BE]/10 border border-[#20B9BE]/20 rounded-lg px-4 py-2 text-sm text-white max-w-md">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="bg-[#0F161E] border border-[#1E293B] rounded-lg px-4 py-2 text-sm text-white max-w-md">
          <div className="text-[10px] text-[#20B9BE] font-semibold mb-1">AI</div>
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'admin') {
    return (
      <div className="flex justify-start">
        <div className="bg-[#F2994A]/10 border border-[#F2994A]/20 rounded-lg px-4 py-2 text-sm text-white max-w-md">
          <div className="text-[10px] text-[#F2994A] font-semibold mb-1">
            {message.admin_name || 'Admin'}
          </div>
          {message.content}
        </div>
      </div>
    );
  }

  return null;
}
