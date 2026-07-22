'use strict';
import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../lib/types';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import HandoffBanner from './HandoffBanner';
import ToolActivityChip from './ToolActivityChip';

interface ChatWindowProps {
  isOpen: boolean;
  messages: ChatMessage[];
  streaming: boolean;
  paused: boolean;
  error: string | null;
  loading: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

export default function ChatWindow({
  isOpen,
  messages,
  streaming,
  paused,
  error,
  loading,
  onSend,
  onClose,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  if (!isOpen) return null;

  const activeToolMessage = messages.find((m) => m.role === 'system' && m.toolName);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '84px',
        right: '20px',
        width: '380px',
        height: '520px',
        background: 'linear-gradient(145deg, #fdfbff 0%, #f8f5fc 50%, #fef7ff 100%)',
        border: '1px solid rgba(128, 19, 127, 0.12)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(128,19,127,0.15), 0 0 0 1px rgba(128,19,127,0.06), 0 8px 32px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 999998,
        animation: 'w-slide-up 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px',
        background: 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
        borderBottom: '1px solid rgba(128,19,127,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Avatar */}
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '13px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Tashus Support AI
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 6px #4ade80',
                display: 'inline-block',
                animation: 'w-pulse 2s infinite',
              }} />
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: '30px', height: '30px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: 'transparent',
        }}
      >
        {loading ? (
          /* Skeleton */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
            {[70, 50, 80].map((w, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end',
              }}>
                <div style={{
                  width: `${w}%`,
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(128,19,127,0.08)',
                  border: '1px solid rgba(128,19,127,0.12)',
                  animation: 'w-pulse 1.6s ease-in-out infinite',
                }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', textAlign: 'center', padding: '24px',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px',
              background: 'linear-gradient(135deg, #80137f, #9d1b9c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '16px',
              boxShadow: '0 8px 24px rgba(128,19,127,0.25)',
            }}>
              <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>
              Welcome to Tashus Support
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(0,0,0,0.5)', lineHeight: 1.6, maxWidth: '240px' }}>
              Ask about vehicle availability, rental policies, vouchers, or anything about Tashus.
            </div>

            {/* Quick prompts */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '7px', width: '100%' }}>
              {['Find a car in Sydney this weekend', 'What are the rental policies?', 'Do you have any active vouchers?'].map((q) => (
                <button
                  key={q}
                  onClick={() => onSend(q)}
                  style={{
                    padding: '9px 14px',
                    borderRadius: '10px',
                    background: 'rgba(128,19,127,0.06)',
                    border: '1px solid rgba(128,19,127,0.15)',
                    color: 'rgba(0,0,0,0.7)',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(128,19,127,0.12)';
                    e.currentTarget.style.color = '#1a1a1a';
                    e.currentTarget.style.borderColor = 'rgba(128,19,127,0.25)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(128,19,127,0.06)';
                    e.currentTarget.style.color = 'rgba(0,0,0,0.7)';
                    e.currentTarget.style.borderColor = 'rgba(128,19,127,0.15)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}

        {/* Tool activity indicator */}
        {streaming && activeToolMessage?.toolName && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
            <ToolActivityChip toolName={activeToolMessage.toolName} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px',
            color: '#dc2626',
            fontSize: '11px',
            textAlign: 'center',
            margin: '8px 0',
          }}>
            {error}
          </div>
        )}
      </div>

      {paused && <HandoffBanner />}
      <Composer onSend={onSend} disabled={loading || streaming} />
    </div>
  );
}
