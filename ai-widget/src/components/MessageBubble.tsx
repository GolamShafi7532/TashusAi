'use strict';
import React, { useState } from 'react';
import type { ChatMessage } from '../lib/types';
import StreamingCursor from './StreamingCursor';
import VehicleResultCard from './VehicleResultCard';
import VoucherResultCard from './VoucherResultCard';

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const { role, content, streaming } = message;
  const isUser = role === 'user';
  const isAdmin = role === 'admin';
  const isSystem = role === 'system' && !message.toolName;
  const [hovered, setHovered] = useState(false);

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

  /* ── CTA Button renderer ────────────────────────────────────────── */
  const CtaButton = ({ label, url }: { label: string; url: string }) => {
    const [btnHovered, setBtnHovered] = useState(false);
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

    const regex = /\[(VEHICLE|VOUCHER|CTA):\s*(\{.*?\})\]/gs;
    const parts: { type: string; val: any }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(processedText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', val: processedText.substring(lastIndex, match.index) });
      }
      try {
        parts.push({ type: match[1].toLowerCase(), val: JSON.parse(match[2]) });
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
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  gap: '10px',
                  paddingBottom: '4px',
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
            );
          }
          if (p.type === 'voucher') {
            return <VoucherResultCard key={i} voucher={p.val} />;
          }
          if (p.type === 'cta') {
            return <CtaButton key={i} label={p.val.label} url={p.val.url} />;
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* Timestamp on hover */}
      {hovered && message.createdAt && (
        <div style={{
          fontSize: '9px',
          color: 'rgba(0,0,0,0.3)',
          fontWeight: 500,
          marginTop: '6px',
          paddingLeft: isUser ? 0 : '4px',
          paddingRight: isUser ? '4px' : 0,
          animation: 'w-fade-in 0.15s ease-out',
        }}>
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}
