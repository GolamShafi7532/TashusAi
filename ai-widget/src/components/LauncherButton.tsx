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
      title={isOpen ? 'Close support chat' : 'Chat with Tashus AI'}
      style={{
        width: '54px',
        height: '54px',
        borderRadius: '16px',
        background: isOpen
          ? 'linear-gradient(135deg, #6b1068 0%, #4a0b48 100%)'
          : 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
        boxShadow: isOpen
          ? '0 6px 20px rgba(128,19,127,0.35)'
          : '0 12px 40px rgba(128,19,127,0.5), 0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 999999,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 16px 48px rgba(128,19,127,0.6), 0 6px 16px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1) translateY(0)';
        e.currentTarget.style.boxShadow = isOpen
          ? '0 6px 20px rgba(128,19,127,0.35)'
          : '0 12px 40px rgba(128,19,127,0.5), 0 4px 12px rgba(0,0,0,0.15)';
      }}
    >
      {isOpen ? (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}
          style={{ transition: 'transform 0.2s', transform: 'rotate(0deg)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      ) : (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )}

      {/* Unread badge */}
      {!isOpen && unreadCount > 0 && (
        <span style={{
          position: 'absolute',
          top: '-5px',
          right: '-5px',
          minWidth: '18px',
          height: '18px',
          borderRadius: '9px',
          background: '#f59e0b',
          border: '2px solid #0f0d16',
          fontSize: '9px',
          fontWeight: 800,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 3px',
          animation: 'w-notification-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}

      {/* Pulse ring when closed */}
      {!isOpen && (
        <span style={{
          position: 'absolute',
          inset: '-4px',
          borderRadius: '20px',
          border: '2px solid rgba(128,19,127,0.4)',
          animation: 'w-ring-pulse 2.5s ease-out infinite',
          pointerEvents: 'none',
        }} />
      )}
    </button>
  );
}
