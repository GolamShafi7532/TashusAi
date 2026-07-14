import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, StreamEvent } from '../lib/types';
import {
  fetchOrCreateSession,
  fetchHistory,
  openSSEStream,
  verifyTashusToken,
} from '../lib/sse-client';

const VISITOR_KEY = 'tashus_ai_visitor_id';
const SESSION_KEY = 'tashus_ai_session_id';

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = `visitor_${uuidv4()}`;
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  streaming: boolean;
  paused: boolean;           // AI circuit-breaker active
  error: string | null;
  sessionId: string | null;
  historyLoading: boolean;
  unreadCount: number;
  send: (text: string) => void;
  clearUnread: () => void;
}

export function useChatStream(jwtCookieName?: string): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // ── Bootstrap: create/retrieve session ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const visitorId = getOrCreateVisitorId();
        const cachedSession = sessionStorage.getItem(SESSION_KEY);
        let sid = cachedSession;

        if (!sid) {
          sid = await fetchOrCreateSession(visitorId);
          sessionStorage.setItem(SESSION_KEY, sid);
        }

        if (cancelled) return;
        setSessionId(sid);

        // Handle Tashus JWT passthrough
        if (jwtCookieName) {
          const cookieMatch = document.cookie
            .split(';')
            .find((c) => c.trim().startsWith(`${jwtCookieName}=`));
          if (cookieMatch) {
            const token = cookieMatch.split('=').slice(1).join('=').trim();
            if (token) {
              verifyTashusToken(sid, token).catch(() => {});
            }
          }
        }

        // Load message history
        const history = await fetchHistory(sid);
        if (cancelled) return;

        const historicMessages: ChatMessage[] = history
          .filter((m) => m.role !== 'tool' && m.role !== 'system')
          .map((m) => ({
            id: m.id || makeId(),
            role: m.role as ChatMessage['role'],
            content: m.content,
            createdAt: new Date(m.created_at),
          }));

        setMessages(historicMessages);
      } catch (err) {
        if (!cancelled) {
          setError('Could not connect to Tashus AI. Please try again.');
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [jwtCookieName]);

  // ── Stream handler ───────────────────────────────────────────────────────────
  const send = useCallback(
    (text: string) => {
      if (!sessionId || streaming || !text.trim()) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: text.trim(),
        createdAt: new Date(),
      };

      // Add empty assistant placeholder for streaming
      const assistantId = makeId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);
      setError(null);

      let accumulatedText = '';

      openSSEStream(sessionId, text.trim(), controller, {
        onEvent(event: StreamEvent) {
          switch (event.type) {
            case 'token':
              accumulatedText += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: accumulatedText, streaming: true }
                    : m
                )
              );
              break;

            case 'tool_start':
              setMessages((prev) => [
                ...prev,
                {
                  id: makeId(),
                  role: 'system',
                  content: `Checking ${event.tool}…`,
                  toolName: event.tool,
                  createdAt: new Date(),
                },
              ]);
              break;

            case 'tool_result':
              // Remove the tool_start chip for this tool
              setMessages((prev) =>
                prev.filter((m) => !(m.toolName === event.tool && m.role === 'system'))
              );
              break;

            case 'admin_message':
              setMessages((prev) => [
                ...prev,
                {
                  id: event.message.id || makeId(),
                  role: 'admin',
                  content: event.message.content,
                  createdAt: new Date(event.message.created_at || Date.now()),
                },
              ]);
              setUnreadCount((n) => n + 1);
              break;

            case 'paused':
              setPaused(true);
              setStreaming(false);
              // Finalize the streaming assistant message if any partial text
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, streaming: false } : m
                )
              );
              if (event.message) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: makeId(),
                    role: 'system',
                    content: event.message!.content,
                    createdAt: new Date(),
                  },
                ]);
              }
              break;

            case 'released':
              setPaused(false);
              break;

            case 'done':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: event.message, streaming: false }
                    : m
                )
              );
              setStreaming(false);
              break;

            case 'error':
              setError(event.message || 'An error occurred.');
              setStreaming(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, streaming: false } : m
                )
              );
              break;
          }
        },

        onError(err) {
          if (controller.signal.aborted) return;
          console.error('[Widget SSE] Error:', err);
          setError('Connection lost. Please try again.');
          setStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
        },

        onClose() {
          setStreaming(false);
          // Finalize message in case done event was missed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.streaming
                ? { ...m, streaming: false }
                : m
            )
          );
        },
      });
    },
    [sessionId, streaming]
  );

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  return {
    messages,
    streaming,
    paused,
    error,
    sessionId,
    historyLoading,
    unreadCount,
    send,
    clearUnread,
  };
}
