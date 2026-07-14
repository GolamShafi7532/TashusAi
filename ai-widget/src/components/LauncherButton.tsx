'use strict';
import React from 'react';

interface LauncherProps {
  isOpen: boolean;
  onClick: () => void;
  unreadCount?: number;
}

export default function LauncherButton({ isOpen, onClick, unreadCount = 0 }: LauncherProps) {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 bg-[#20B9BE] hover:bg-[#17878b] text-white rounded-full flex items-center justify-center transition-all shadow-xl shadow-[#20B9BE]/25 hover:scale-105 active:scale-95 duration-200 relative shrink-0"
      title={isOpen ? 'Close support chat' : 'Open Tashus support AI'}
      style={{
        zIndex: 999999
      }}
    >
      {isOpen ? (
        <svg className="w-6 h-6 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-6 h-6 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )}

      {/* Unread Message Notification Badge */}
      {!isOpen && unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-5 h-5 bg-[#F2994A] border-2 border-[#090D11] rounded-full text-[9px] font-black text-white flex items-center justify-center px-1 shadow-md shadow-[#F2994A]/20"
          style={{
            animation: 'w-notification-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
