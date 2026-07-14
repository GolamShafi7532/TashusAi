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

  // Auto-scroll scroll container to bottom on message updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  if (!isOpen) return null;

  // Find if there is an active tool run currently streaming
  const activeToolMessage = messages.find((m) => m.role === 'system' && m.toolName);

  return (
    <div
      className="fixed bottom-20 right-0 sm:right-4 w-full sm:w-[400px] h-[calc(100vh-6rem)] sm:h-[600px] bg-[#0F161E] border border-[#1E293B] sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col z-[999998]"
      style={{
        animation: 'w-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      {/* Header */}
      <header className="px-5 py-4 border-b border-[#1E293B] bg-[#090D11]/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1 bg-[#20B9BE]/10 rounded-lg border border-[#20B9BE]/20 text-[#20B9BE]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white text-xs leading-none">Tashus Support</h3>
            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-semibold mt-1">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#94A3B8] hover:text-white p-1 hover:bg-[#1E293B] rounded-lg transition-all"
          title="Minimize chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </header>

      {/* Body messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin bg-[#090D11]/10"
      >
        {loading ? (
          /* Loading Skeleton */
          <div className="space-y-4 py-4">
            <div className="flex justify-start max-w-[70%]">
              <div className="bg-[#1E293B] rounded-2xl rounded-tl-none p-3.5 w-full space-y-2 animate-pulse">
                <div className="h-2 w-12 bg-[#334155] rounded" />
                <div className="h-3 w-40 bg-[#334155] rounded" />
              </div>
            </div>
            <div className="flex justify-end max-w-[70%] ml-auto">
              <div className="bg-[#20B9BE]/30 rounded-2xl rounded-tr-none p-3.5 w-full space-y-2 animate-pulse">
                <div className="h-2 w-12 bg-[#20B9BE]/40 rounded" />
                <div className="h-3 w-32 bg-[#20B9BE]/40 rounded" />
              </div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="p-3 bg-[#20B9BE]/10 rounded-2xl text-[#20B9BE] mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h4 className="text-white font-bold text-xs">Welcome to Tashus Support</h4>
            <p className="text-[10px] text-[#94A3B8] leading-relaxed mt-1">
              Ask about vehicle availability, rental policies, promotional vouchers, and insurance coverage.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}

        {/* System level tool loaders */}
        {streaming && activeToolMessage && activeToolMessage.toolName && (
          <div className="flex justify-start w-full my-2">
            <ToolActivityChip toolName={activeToolMessage.toolName} />
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] text-center my-2 select-none">
            {error}
          </div>
        )}
      </div>

      {/* Takeover Handoff alert banner */}
      {paused && <HandoffBanner />}

      {/* Composer Input */}
      <Composer onSend={onSend} disabled={loading || streaming} />
    </div>
  );
}
