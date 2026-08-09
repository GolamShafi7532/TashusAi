'use strict';
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

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
      const res = await apiFetch(`/api/admin/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession((prev: any) => {
          if (!prev || prev.is_ai_paused !== data.session?.is_ai_paused || prev.status !== data.session?.status) {
            return data.session;
          }
          return prev;
        });
        setMessages((prev: any[]) => {
          const newMsgs = data.messages || [];
          if (prev.length !== newMsgs.length || (newMsgs.length > 0 && prev[prev.length - 1]?.id !== newMsgs[newMsgs.length - 1]?.id)) {
            return newMsgs;
          }
          return prev;
        });
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
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/takeover`, { method: 'POST' });
      if (res.ok) {
        fetchSessionDetails(false);
      }
    } catch (err) {
      console.error('Takeover failed:', err);
    }
  };

  const handleRelease = async () => {
    try {
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/release`, { method: 'POST' });
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
      const res = await apiFetch(`/api/admin/sessions/${sessionId}/messages`, {
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

  /* ── Inline vehicle card styled for the dark admin UI ────────── */
  const AdminVehicleCard = ({ v }: { v: any }) => {
    const norm = (() => {
      if (v.listingId !== undefined || v.coverPhotoUrl !== undefined || v.displayName !== undefined) {
        return {
          id: v.listingId ?? 0,
          displayName: v.displayName ?? 'Vehicle',
          dailyRate: v.dailyRate ?? 0,
          seats: v.seats as number | undefined,
          transmission: v.transmission as string | undefined,
          carType: v.carType as string | undefined,
          imageUrl: v.coverPhotoUrl ?? '',
          locationLabel: v.location ? (v.location.city as string) : undefined as string | undefined,
          hostRating: v.hostRating as number | undefined,
        };
      }
      const name = [v.make, v.model, v.year ? `(${v.year})` : ''].filter(Boolean).join(' ');
      return {
        id: v.id ?? 0,
        displayName: name || 'Vehicle',
        dailyRate: v.dailyRate ?? 0,
        seats: v.seats as number | undefined,
        transmission: v.transmission as string | undefined,
        carType: undefined as string | undefined,
        imageUrl: v.imageUrl ?? '',
        locationLabel: undefined as string | undefined,
        hostRating: undefined as number | undefined,
      };
    })();

    const rate = new Intl.NumberFormat('en-AU', {
      style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
    }).format(norm.dailyRate);

    const [hovered, setHovered] = useState(false);

    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '168px',
          minWidth: '168px',
          background: hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          border: hovered ? '1px solid rgba(32,185,190,0.45)' : '1px solid rgba(32,185,190,0.15)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.15s',
          boxShadow: hovered ? '0 6px 20px rgba(32,185,190,0.18)' : '0 2px 8px rgba(0,0,0,0.25)',
          transform: hovered ? 'translateY(-2px)' : 'none',
          flexShrink: 0,
          scrollSnapAlign: 'start',
          cursor: 'default',
        }}
      >
        {/* Image */}
        <div style={{ position: 'relative', width: '100%', height: '90px', flexShrink: 0, background: '#0a1118' }}>
          {norm.imageUrl ? (
            <img
              src={norm.imageUrl}
              alt={norm.displayName}
              style={{ width: '100%', height: '90px', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&auto=format&fit=crop&q=60';
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '90px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.2)', fontSize: '10px',
            }}>No image</div>
          )}
          {/* Gradient overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 55%)',
            pointerEvents: 'none',
          }} />
          {/* Price badge */}
          <div style={{
            position: 'absolute', bottom: '5px', right: '5px',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(32,185,190,0.25)',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '10px', fontWeight: 800, color: '#fff', lineHeight: 1.4,
          }}>
            {rate}
            <span style={{ fontSize: '8px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginLeft: '1px' }}>/day</span>
          </div>
        </div>

        {/* Details */}
        <div style={{
          flex: 1, padding: '8px 9px 9px',
          display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden',
        }}>
          {/* Name */}
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#E4E6EB',
            lineHeight: 1.35, height: '30px', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {norm.displayName}
          </div>

          {/* Spec pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', minHeight: '18px' }}>
            {norm.carType && (
              <span style={{
                fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: '#20B9BE', background: 'rgba(32,185,190,0.12)', border: '1px solid rgba(32,185,190,0.2)',
                padding: '2px 4px', borderRadius: '4px',
              }}>{norm.carType}</span>
            )}
            {norm.seats && (
              <span style={{
                fontSize: '8px', color: 'rgba(228,230,235,0.55)', fontWeight: 500,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                padding: '2px 4px', borderRadius: '4px',
              }}>👤 {norm.seats}</span>
            )}
            {norm.transmission && (
              <span style={{
                fontSize: '8px', color: 'rgba(228,230,235,0.55)', fontWeight: 500,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                padding: '2px 4px', borderRadius: '4px',
              }}>{norm.transmission}</span>
            )}
          </div>

          {/* Location + rating */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: '14px', overflow: 'hidden',
          }}>
            {norm.locationLabel ? (
              <span style={{
                fontSize: '8px', color: 'rgba(148,163,184,0.7)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px',
              }}>📍 {norm.locationLabel}</span>
            ) : <span />}
            {norm.hostRating !== undefined && norm.hostRating > 0 && (
              <span style={{ fontSize: '8px', color: '#f97316', fontWeight: 700, flexShrink: 0 }}>
                ⭐ {norm.hostRating}
              </span>
            )}
          </div>

          {/* CTA */}
          <button
            style={{
              width: '100%', marginTop: 'auto', padding: '6px 0',
              background: 'linear-gradient(135deg, #20B9BE 0%, #17878b 100%)',
              border: 'none', borderRadius: '8px',
              color: '#fff', fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em',
              cursor: 'pointer', transition: 'opacity 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            onClick={() => window.open(`/search/${norm.id}/vehicle-details`, '_blank')}
          >
            View Details →
          </button>
        </div>
      </div>
    );
  };

  /* ── Vehicle row with custom scrollbar ───────────────────────── */
  const AdminVehicleGroup = ({ vehicles }: { vehicles: any[] }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [thumbLeft, setThumbLeft] = useState(0);
    const [thumbWidth, setThumbWidth] = useState(40);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartX = useRef(0);
    const dragStartScroll = useRef(0);

    const updateThumb = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      const scrollable = el.scrollWidth - el.clientWidth;
      const ratio = scrollable > 0 ? el.scrollLeft / scrollable : 0;
      const trackW = el.clientWidth - 8;
      const tw = Math.max(28, (el.clientWidth / (el.scrollWidth || 1)) * trackW);
      setThumbWidth(tw);
      setThumbLeft(ratio * (trackW - tw));
    }, []);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      updateThumb();
      el.addEventListener('scroll', updateThumb, { passive: true });
      const ro = new ResizeObserver(updateThumb);
      ro.observe(el);
      return () => { el.removeEventListener('scroll', updateThumb); ro.disconnect(); };
    }, [updateThumb]);

    const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      const track = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - track.left) / track.width;
      el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
    };

    const onThumbMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartScroll.current = scrollRef.current?.scrollLeft ?? 0;
    };

    useEffect(() => {
      if (!isDragging) return;
      const onMove = (e: MouseEvent) => {
        const el = scrollRef.current;
        if (!el) return;
        const dx = e.clientX - dragStartX.current;
        const trackW = el.clientWidth - 8;
        const scrollRange = el.scrollWidth - el.clientWidth;
        el.scrollLeft = dragStartScroll.current + (dx / (trackW - thumbWidth)) * scrollRange;
      };
      const onUp = () => setIsDragging(false);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isDragging, thumbWidth]);

    const showScrollbar = vehicles.length > 1;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        <div
          ref={scrollRef}
          style={{
            display: 'flex', flexDirection: 'row', flexWrap: 'nowrap',
            overflowX: 'auto', gap: '10px', paddingBottom: '2px',
            scrollSnapType: 'x mandatory',
          }}
          className="[&::-webkit-scrollbar]:hidden"
        >
          {vehicles.map((v: any, vi: number) => (
            <AdminVehicleCard key={vi} v={v} />
          ))}
        </div>

        {/* Custom scrollbar track */}
        {showScrollbar && (
          <div
            onClick={onTrackClick}
            style={{
              position: 'relative',
              height: '4px',
              background: 'rgba(255,255,255,0.07)',
              borderRadius: '999px',
              margin: '0 4px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              onMouseDown={onThumbMouseDown}
              style={{
                position: 'absolute',
                top: 0,
                left: `${thumbLeft}px`,
                width: `${thumbWidth}px`,
                height: '4px',
                background: 'linear-gradient(90deg, #20B9BE, #17878b)',
                borderRadius: '999px',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'left 0.08s ease',
                boxShadow: '0 0 6px rgba(32,185,190,0.45)',
              }}
            />
          </div>
        )}
      </div>
    );
  };

  /* ── Parse message content for VEHICLE tokens ────────────────── */
  const parseAdminContent = (content: string): React.ReactNode => {
    const regex = /\[VEHICLE:\s*(\{[\s\S]*?\})\]/g;

    const parts: { type: string; val: any }[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', val: content.substring(lastIndex, match.index) });
      }
      try {
        parts.push({ type: 'vehicle', val: JSON.parse(match[1]) });
      } catch {
        parts.push({ type: 'text', val: match[0] });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', val: content.substring(lastIndex) });
    }

    // Group consecutive vehicle parts
    const grouped: { type: string; val: any }[] = [];
    let vehicleBuf: any[] = [];
    for (const p of parts) {
      if (p.type === 'vehicle') {
        vehicleBuf.push(p.val);
      } else {
        if (vehicleBuf.length > 0) {
          grouped.push({ type: 'vehicle_group', val: vehicleBuf });
          vehicleBuf = [];
        }
        if (p.val.trim() !== '') grouped.push(p);
      }
    }
    if (vehicleBuf.length > 0) grouped.push({ type: 'vehicle_group', val: vehicleBuf });

    if (grouped.length === 0) {
      return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {grouped.map((p, i) => {
          if (p.type === 'text') {
            return <span key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, display: 'block' }}>{p.val}</span>;
          }
          if (p.type === 'vehicle_group') {
            return <AdminVehicleGroup key={i} vehicles={p.val} />;
          }
          return null;
        })}
      </div>
    );
  };

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

                  <div className="leading-relaxed">{parseAdminContent(msg.content)}</div>

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
