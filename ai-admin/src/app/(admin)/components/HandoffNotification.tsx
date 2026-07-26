'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface HandoffToast {
  id: string;
  session_id: string;
  visitor_id: string;
  reason: string;
  timestamp: string;
}

export function HandoffNotificationProvider() {
  const [toasts, setToasts] = useState<HandoffToast[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();
  // Track dismissed toasts so they don't reappear on reconnect
  const dismissedRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    dismissedRef.current.add(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto-dismiss after 30s
  useEffect(() => {
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), 30000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  // SSE connection to admin notifications stream
  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      const es = new EventSource('/api/admin/notifications/stream');
      esRef.current = es;

      es.addEventListener('handoff_requested', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as Omit<HandoffToast, 'id'>;
          const id = `${data.session_id}-${data.timestamp}`;
          if (dismissedRef.current.has(id)) return;

          setToasts((prev) => {
            // Deduplicate by session_id
            if (prev.some((t) => t.session_id === data.session_id)) return prev;
            return [{ ...data, id }, ...prev].slice(0, 5); // max 5 visible
          });

          // Attempt browser notification
          if (typeof window !== 'undefined' && Notification?.permission === 'granted') {
            new Notification('🤝 Handoff Requested', {
              body: `Visitor ${data.visitor_id} needs a human agent`,
              icon: '/favicon.ico',
            });
          }
        } catch { /* malformed */ }
      });

      es.onerror = () => {
        es.close();
        if (mounted) {
          retryRef.current = setTimeout(connect, 5000);
        }
      };
    };

    // Request notification permission once
    if (typeof window !== 'undefined' && Notification?.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    connect();

    return () => {
      mounted = false;
      esRef.current?.close();
      clearTimeout(retryRef.current);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '360px',
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: 'linear-gradient(135deg, #1a0f1a 0%, #1f1028 100%)',
            border: '1px solid rgba(242, 153, 74, 0.4)',
            borderRadius: '14px',
            padding: '14px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(242,153,74,0.1)',
            pointerEvents: 'all',
            animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#f97316',
                boxShadow: '0 0 8px #f97316',
                animation: 'pulse 1s infinite',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f97316', letterSpacing: '0.02em' }}>
                Handoff Requested
              </span>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: '16px', lineHeight: 1,
                padding: '2px 4px',
              }}
            >×</button>
          </div>

          {/* Body */}
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', margin: '0 0 10px', lineHeight: 1.5 }}>
            <strong style={{ color: '#fff' }}>{toast.visitor_id || 'A visitor'}</strong> is asking for human assistance.
          </p>

          {/* Timestamp */}
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', margin: '0 0 12px' }}>
            {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>

          {/* CTA */}
          <Link
            href={`/sessions/${toast.session_id}`}
            onClick={() => dismiss(toast.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            Respond Now
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
