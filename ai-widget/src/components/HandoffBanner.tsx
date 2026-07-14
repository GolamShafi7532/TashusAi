'use strict';
import React from 'react';

export default function HandoffBanner() {
  return (
    <div
      className="p-3 bg-[#F2994A]/10 border border-[#F2994A]/20 text-[#F2994A] rounded-xl flex items-center gap-2.5 mx-4 my-2 text-xs font-medium"
      style={{
        animation: 'w-fade-in 0.3s ease-out'
      }}
    >
      <span className="w-2 h-2 rounded-full bg-[#F2994A] animate-pulse shrink-0" />
      <div>
        <p className="font-bold text-[#E4E6EB]">Human agent connected</p>
        <p className="text-[10px] text-[#94A3B8] mt-0.5">Tashus bot paused. Responses may take slightly longer.</p>
      </div>
    </div>
  );
}
