'use strict';
import React, { useRef, useState, useCallback, useEffect } from 'react';

import type { ChatMessage } from '../lib/types';
import StreamingCursor from './StreamingCursor';
import VehicleResultCard from './VehicleResultCard';
import VoucherResultCard from './VoucherResultCard';

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const { role, content, streaming } = message;
  const isUser = role === 'user';
  const isAdmin = role === 'admin';
  const isSystem = role === 'system' && !message.toolName;

  /* System / tool status pills */
  if (role === 'system' && !message.toolName) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
        <span style={{
          fontSize: '10px',
          color: 'rgba(0,0,0,0.4)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: 'rgba(128,19,127,0.08)',
          border: '1px solid rgba(128,19,127,0.12)',
          padding: '3px 10px',
          borderRadius: '20px',
        }}>
          {content}
        </span>
      </div>
    );
  }

  /* ── Document → URL mapping ────────────────────────────────────── */
  const DOC_URL_MAP: Record<string, string> = {
    'tashus rental agreement': '/legals/rental-agreement',
    'tashus privacy policy': '/legals/privacy',
    'tashus support': '',          // KB-only — no link
  };

  function resolveDocUrl(document: string): string {
    return DOC_URL_MAP[document.toLowerCase().trim()] ?? '';
  }

  /* ── Document → icon mapping ────────────────────────────────────── */
  function resolveDocIcon(document: string): React.ReactNode {
    const key = document.toLowerCase();
    if (key.includes('privacy')) {
      // Shield icon
      return (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 10c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.25-8.25-3.286z" />
        </svg>
      );
    }
    if (key.includes('rental') || key.includes('agreement')) {
      // Document icon
      return (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    }
    // Default: info circle for KB-only
    return (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    );
  }

  /* ── Source Card component ──────────────────────────────────────── */
  const SourceCard = ({ document, section }: { document: string; section: string }) => {
    const [hovered, setHovered] = React.useState(false);
    const url = resolveDocUrl(document);
    const hasLink = url.length > 0;

    const cardStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      marginTop: '10px',
      padding: '9px 12px',
      borderRadius: '10px',
      background: hovered && hasLink
        ? 'rgba(128,19,127,0.07)'
        : 'rgba(128,19,127,0.04)',
      border: '1px solid rgba(128,19,127,0.15)',
      cursor: hasLink ? 'pointer' : 'default',
      transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
      transform: hovered && hasLink ? 'translateY(-1px)' : 'none',
      borderColor: hovered && hasLink
        ? 'rgba(128,19,127,0.3)'
        : 'rgba(128,19,127,0.15)',
      textDecoration: 'none',
      userSelect: 'none' as const,
    };

    const inner = (
      <>
        {/* Left: icon + text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          {/* Icon container */}
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, rgba(128,19,127,0.12) 0%, rgba(157,27,156,0.18) 100%)',
            border: '1px solid rgba(128,19,127,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'rgba(128,19,127,0.9)',
          }}>
            {resolveDocIcon(document)}
          </div>

          {/* Text stack */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: 'rgba(128,19,127,0.65)',
              marginBottom: '2px',
            }}>
              Source
            </div>
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'rgba(0,0,0,0.8)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap' as const,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {document}
            </div>
            {section && section !== 'Official Policy' && (
              <div style={{
                fontSize: '10px',
                color: 'rgba(0,0,0,0.45)',
                fontWeight: 500,
                marginTop: '1px',
                whiteSpace: 'nowrap' as const,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {section}
              </div>
            )}
          </div>
        </div>

        {/* Right: arrow (only when there's a link) */}
        {hasLink && (
          <div style={{
            flexShrink: 0,
            color: hovered ? 'rgba(128,19,127,0.9)' : 'rgba(128,19,127,0.4)',
            transition: 'color 0.15s, transform 0.15s',
            transform: hovered ? 'translateX(2px)' : 'none',
          }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </div>
        )}
      </>
    );

    if (hasLink) {
      return (
        <div
          style={cardStyle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => { window.parent.location.href = url; }}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.parent.location.href = url; }}
          aria-label={`View ${document}${section ? ` — ${section}` : ''}`}
        >
          {inner}
        </div>
      );
    }

    return (
      <div style={cardStyle}>
        {inner}
      </div>
    );
  };

  /* ── CTA Button renderer ────────────────────────────────────────── */
  const CtaButton = ({ label, url }: { label: string; url: string }) => {
    const [btnHovered, setBtnHovered] = React.useState(false);
    return (
      <button
        onClick={() => { window.parent.location.href = url; }}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '9px 16px',
          marginTop: '6px',
          background: btnHovered
            ? 'linear-gradient(135deg, #6b1068 0%, #87178a 100%)'
            : 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
          border: 'none',
          borderRadius: '10px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          boxShadow: btnHovered
            ? '0 6px 20px rgba(128,19,127,0.4)'
            : '0 3px 12px rgba(128,19,127,0.25)',
          transform: btnHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Arrow icon */}
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {label}
      </button>
    );
  };

  /* ── Rich content parser ───────────────────────────────────────── */
  const parseRichContent = (text: string): React.ReactNode => {
    if (!text) return null;

    // Pre-process: convert markdown links that look like CTA buttons into [CTA:] tags.
    // Handles: 👉 [label](url)  OR  [label](url) at start of a line
    const processedText = text.replace(
      /(?:👉\s*)?\[([^\]]+)\]\((\/[^\)]+)\)/g,
      (_full, label, url) => `[CTA: {"label": "${label.replace(/→/g, '').trim()}", "url": "${url}"}]`
    );

    const regex = /\[(VEHICLE|VOUCHER|CTA|SOURCE_CARD):\s*(\{.*?\})\]/gs;
    const parts: { type: string; val: any }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(processedText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', val: processedText.substring(lastIndex, match.index) });
      }
      try {
        parts.push({ type: match[1].toLowerCase().replace('_card', '_card'), val: JSON.parse(match[2]) });
      } catch {
        parts.push({ type: 'text', val: match[0] });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < processedText.length) {
      parts.push({ type: 'text', val: processedText.substring(lastIndex) });
    }

    // Group consecutive vehicles for horizontal scroll
    const grouped: { type: string; val: any }[] = [];
    let vehicleBuf: any[] = [];

    for (const p of parts) {
      if (p.type === 'vehicle') {
        vehicleBuf.push(p.val);
      } else {
        if (p.type === 'text' && p.val.trim() === '') continue;
        if (vehicleBuf.length > 0) {
          grouped.push({ type: 'vehicle_group', val: vehicleBuf });
          vehicleBuf = [];
        }
        grouped.push(p);
      }
    }
    if (vehicleBuf.length > 0) grouped.push({ type: 'vehicle_group', val: vehicleBuf });

    if (grouped.length === 0) return <span>{text}</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {grouped.map((p, i) => {
          if (p.type === 'text') {
            return (
              <span key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, display: 'block' }}>
                {p.val}
              </span>
            );
          }
          if (p.type === 'vehicle_group') {
            /* ── Carousel with custom scrollbar ── */
            const VehicleCarousel = () => {
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
                const tw = Math.max(24, (el.clientWidth / (el.scrollWidth || 1)) * trackW);
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
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
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
                return () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
              }, [isDragging, thumbWidth]);

              const showScrollbar = p.val.length > 1;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
                  {/* Card row */}
                  <div
                    ref={scrollRef}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'nowrap',
                      overflowX: 'auto',
                      gap: '10px',
                      paddingBottom: '2px',
                      scrollSnapType: 'x mandatory',
                      msOverflowStyle: 'none',
                      scrollbarWidth: 'none',
                    }}
                  >
                    {p.val.map((v: any, vi: number) => (
                      <div
                        key={vi}
                        style={{
                          width: '158px',
                          minWidth: '158px',
                          maxWidth: '158px',
                          flexShrink: 0,
                          scrollSnapAlign: 'start',
                        }}
                      >
                        <VehicleResultCard vehicle={v} />
                      </div>
                    ))}
                  </div>

                  {/* Custom scrollbar */}
                  {showScrollbar && (
                    <div
                      onClick={onTrackClick}
                      style={{
                        position: 'relative',
                        height: '4px',
                        background: 'rgba(128,19,127,0.1)',
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
                          background: 'linear-gradient(90deg, #80137f, #9d1b9c)',
                          borderRadius: '999px',
                          cursor: isDragging ? 'grabbing' : 'grab',
                          transition: isDragging ? 'none' : 'left 0.08s ease',
                          boxShadow: '0 0 5px rgba(128,19,127,0.35)',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            };
            return <VehicleCarousel key={i} />;

          }
          if (p.type === 'voucher') {
            return <VoucherResultCard key={i} voucher={p.val} />;
          }
          if (p.type === 'cta') {
            return <CtaButton key={i} label={p.val.label} url={p.val.url} />;
          }
          if (p.type === 'source_card') {
            return (
              <SourceCard
                key={i}
                document={p.val.document ?? 'Tashus Support'}
                section={p.val.section ?? ''}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  /* ── Bubble ─────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      {/* Role label */}
      <div style={{
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: isUser ? 'rgba(0,0,0,0.35)' : isAdmin ? '#ea580c' : 'rgba(128,19,127,0.85)',
        marginBottom: '6px',
        paddingLeft: isUser ? 0 : '4px',
        paddingRight: isUser ? '4px' : 0,
      }}>
        {isUser ? 'You' : isAdmin ? '● Human Agent' : '✦ Tashus AI'}
      </div>

      {/* Content bubble */}
      <div
        style={{
          maxWidth: isUser ? '82%' : '95%',
          padding: isUser ? '12px 16px' : '14px 16px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: '13px',
          lineHeight: 1.6,
          fontWeight: isUser ? 500 : 400,
          position: 'relative',
          ...(isUser ? {
            background: 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(128,19,127,0.25)',
          } : isAdmin ? {
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.2)',
            borderLeft: '3px solid #f97316',
            color: '#9a3412',
          } : {
            background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(128,19,127,0.12)',
            color: 'rgba(0,0,0,0.85)',
            boxShadow: '0 2px 8px rgba(128,19,127,0.08)',
          }),
        }}
      >
        {/* Thinking dots when streaming but no content yet */}
        {streaming && !content ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0' }}>
            {[0, 150, 300].map((delay) => (
              <span key={delay} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'rgba(128,19,127,0.7)',
                display: 'inline-block',
                animation: `w-dot-bounce 1.2s ease-in-out infinite`,
                animationDelay: `${delay}ms`,
              }} />
            ))}
          </div>
        ) : (
          <>
            {parseRichContent(content)}
            {streaming && <StreamingCursor />}
          </>
        )}
      </div>

      {/* Timestamp — always visible */}
      {message.createdAt && !streaming && (
        <div style={{
          fontSize: '9px',
          color: 'rgba(0,0,0,0.3)',
          fontWeight: 500,
          marginTop: '4px',
          paddingLeft: isUser ? 0 : '4px',
          paddingRight: isUser ? '4px' : 0,
        }}>
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}
