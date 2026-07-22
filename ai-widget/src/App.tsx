'use strict';
import React, { useState } from 'react';
import { useChatStream } from './hooks/useChatStream';
import LauncherButton from './components/LauncherButton';
import ChatWindow from './components/ChatWindow';

interface AppProps {
  jwtCookieName?: string;
}

export default function App({ jwtCookieName }: AppProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    messages,
    streaming,
    paused,
    error,
    historyLoading,
    unreadCount,
    send,
    clearUnread,
  } = useChatStream(jwtCookieName);

  const handleToggle = () => {
    if (!isOpen) clearUnread();
    setIsOpen(!isOpen);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '10px',
        zIndex: 999999,
        pointerEvents: 'auto',
      }}
    >
      <ChatWindow
        isOpen={isOpen}
        messages={messages}
        streaming={streaming}
        paused={paused}
        error={error}
        loading={historyLoading}
        onSend={send}
        onClose={handleToggle}
      />
      <LauncherButton
        isOpen={isOpen}
        onClick={handleToggle}
        unreadCount={unreadCount}
      />
    </div>
  );
}
