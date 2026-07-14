'use strict';
import { useState } from 'react';
import type { ChatMessage } from '../lib/types';
import StreamingCursor from './StreamingCursor';
import VehicleResultCard from './VehicleResultCard';
import VoucherResultCard from './VoucherResultCard';

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const { role, content, streaming } = message;
  const isUser = role === 'user';
  const isAdmin = role === 'admin';
  const isSystem = role === 'system';

  const [hovered, setHovered] = useState(false);

  if (isSystem) {
    return (
      <div className="flex justify-center my-1.5 w-full">
        <span className="text-[10px] text-[#94A3B8] font-bold tracking-wider uppercase bg-[#1E293B]/40 px-3 py-1 rounded-lg border border-[#1E293B]">
          {content}
        </span>
      </div>
    );
  }

  // ── Parse Rich Cards (Vehicle & Voucher JSON tags) ────────────────────────
  const parseRichContent = (text: string) => {
    if (!text) return null;

    // Pattern matching [VEHICLE: {...}] or [VOUCHER: {...}]
    const regex = /\[(VEHICLE|VOUCHER):\s*(\{.*?\})\]/gs;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      
      // Push leading text segment if any
      if (matchIndex > lastIndex) {
        parts.push({
          type: 'text',
          val: text.substring(lastIndex, matchIndex)
        });
      }

      // Parse JSON payload safely
      try {
        const type = match[1];
        const payload = JSON.parse(match[2]);
        parts.push({
          type: type.toLowerCase(),
          val: payload
        });
      } catch (err) {
        // If JSON fails, render raw matched tag
        parts.push({
          type: 'text',
          val: match[0]
        });
      }

      lastIndex = regex.lastIndex;
    }

    // Push remaining trailing text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        val: text.substring(lastIndex)
      });
    }

    if (parts.length === 0) {
      return <span>{text}</span>;
    }

    // Group consecutive vehicle tags for horizontal scroll row
    const groupedParts = [];
    let currentVehicleGroup = [];

    for (const p of parts) {
      if (p.type === 'vehicle') {
        currentVehicleGroup.push(p.val);
      } else if (p.type === 'text' && p.val.trim() === '') {
        // Skip whitespace-only text parts to keep consecutive vehicles grouped together
        continue;
      } else {
        if (currentVehicleGroup.length > 0) {
          groupedParts.push({
            type: 'vehicle_group',
            val: currentVehicleGroup
          });
          currentVehicleGroup = [];
        }
        groupedParts.push(p);
      }
    }
    if (currentVehicleGroup.length > 0) {
      groupedParts.push({
        type: 'vehicle_group',
        val: currentVehicleGroup
      });
    }

    return (
      <div className="space-y-1.5 w-full">
        {groupedParts.map((p, idx) => {
          if (p.type === 'text') {
            return <span key={idx} className="whitespace-pre-wrap leading-relaxed block">{p.val}</span>;
          } else if (p.type === 'vehicle_group') {
            return (
              <div 
                key={idx} 
                className="flex flex-row flex-nowrap overflow-x-auto gap-3 py-2 w-full snap-x snap-mandatory scroll-smooth select-none"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              >
                {p.val.map((vehicle: any, vIdx: number) => (
                  <div key={vIdx} className="w-[185px] min-w-[185px] max-w-[185px] flex-shrink-0 snap-start">
                    <VehicleResultCard vehicle={vehicle} />
                  </div>
                ))}
              </div>
            );
          } else if (p.type === 'voucher') {
            return <VoucherResultCard key={idx} voucher={p.val} />;
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} my-2.5 w-full relative group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`${isUser ? 'max-w-[82%]' : 'max-w-[95%]'} px-4 py-3 rounded-2xl text-xs relative ${
        isUser
          ? 'bg-[#20B9BE] text-white rounded-tr-none shadow-md shadow-[#20B9BE]/5'
          : isAdmin
          ? 'bg-[#1E293B] text-white border-l-4 border-[#F2994A] rounded-tl-none shadow-md'
          : 'bg-[#1E293B] text-[#E4E6EB] rounded-tl-none shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-1 justify-between text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">
          <span>{isAdmin ? 'Human Agent' : role}</span>
        </div>

        {parseRichContent(content)}
        {streaming && <StreamingCursor />}
      </div>

      {/* Floating timestamp on hover */}
      {hovered && message.createdAt && (
        <span
          className="text-[9px] text-[#94A3B8] font-semibold mt-1 px-1.5 transition-all"
          style={{
            animation: 'w-fade-in 0.15s ease-out'
          }}
        >
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
