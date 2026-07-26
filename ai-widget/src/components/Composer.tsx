'use strict';
import React, { useState, useRef, useEffect } from 'react';

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 88)}px`;
  }, [text]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = '40px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = !disabled && text.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '12px 16px 14px',
        borderTop: '1px solid rgba(128,19,127,0.12)',
        background: 'rgba(255,255,255,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        flexShrink: 0,
      }}
    >
      {/* Input wrapper */}
      <div style={{
        flex: 1,
        background: 'rgba(255,255,255,0.8)',
        border: focused
          ? '1px solid rgba(128,19,127,0.5)'
          : '1px solid rgba(128,19,127,0.2)',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        boxShadow: focused ? '0 0 0 3px rgba(128,19,127,0.1)' : 'none',
      }}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          placeholder="Ask Tashus AI support..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: '#1a1a1a',
            fontSize: '13px',
            fontWeight: 400,
            lineHeight: 1.5,
            padding: '10px 12px',
            height: '40px',
            maxHeight: '88px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Send button */}
      <button
        type="submit"
        disabled={!canSend}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: canSend
            ? 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)'
            : 'rgba(128,19,127,0.15)',
          border: canSend
            ? '1px solid rgba(128,19,127,0.2)'
            : '1px solid rgba(128,19,127,0.12)',
          color: canSend ? '#fff' : 'rgba(128,19,127,0.4)',
          cursor: canSend ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
          boxShadow: canSend ? '0 4px 12px rgba(128,19,127,0.25)' : 'none',
        }}
        onMouseEnter={e => { if (canSend) e.currentTarget.style.transform = 'scale(1.06)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <svg
          width="16" height="16" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2.5}
          style={{ transform: 'rotate(90deg)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </form>
  );
}
