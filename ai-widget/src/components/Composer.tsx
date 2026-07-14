'use strict';
import React, { useState, useRef, useEffect } from 'react';

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize height based on contents (up to 4 lines / ~96px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 96);
    el.style.height = `${newHeight}px`;
  }, [text]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;

    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-[#1E293B] bg-[#090D11]/30 flex items-end gap-2.5">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-[#090D11] border border-[#1E293B] hover:border-[#20B9BE] focus:border-[#20B9BE] rounded-xl px-4 py-3 text-xs text-white placeholder-[#94A3B8] focus:outline-none transition-all resize-none max-h-24 scrollbar-none font-medium leading-relaxed"
        placeholder="Ask Tashus AI support..."
        style={{
          height: '42px',
        }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="w-10 h-10 bg-[#20B9BE] hover:bg-[#17878b] disabled:bg-[#1E293B] disabled:text-[#94A3B8] text-white rounded-xl flex items-center justify-center shrink-0 transition-all shadow-md shadow-[#20B9BE]/10"
        title="Send Message"
      >
        <svg className="w-4 h-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </form>
  );
}
