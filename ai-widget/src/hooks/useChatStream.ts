import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, StreamEvent } from '../lib/types';
import {
  fetchOrCreateSession,
  fetchHistory,
  openSSEStream,
  openSessionControlStream,
  pollSessionState,
  verifyTashusToken,
} from '../lib/sse-client';

const VISITOR_KEY = 'tashus_ai_visitor_id';
const SESSION_KEY = 'tashus_ai_session_id'; // localStorage for persistence across tabs/reloads

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
  paused: boolean;
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

  // Track seen message IDs to avoid duplicates from SSE or polling
  const seenMessageIds = useRef<Set<string>>(new Set());
  // Track latest known message timestamp for incremental polling
  const lastAdminMsgAt = useRef<string>(new Date(0).toISOString());
  // Ref of current paused state for use in async callbacks
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Helper to add incoming admin or system message safely
  const handleIncomingMessage = useCallback((msg: {
    id?: string;
    role: string;
    content: string;
    created_at?: string;
    admin_display_name?: string;
  }) => {
    const id = msg.id || makeId();
    if (seenMessageIds.current.has(id)) return;
    seenMessageIds.current.add(id);

    const createdAt = msg.created_at ? new Date(msg.created_at) : new Date();
    const newMsg: ChatMessage = {
      id,
      role: msg.role as ChatMessage['role'],
      content: msg.content,
      adminDisplayName: msg.admin_display_name,
      createdAt,
    };

    setMessages((prev) => [...prev, newMsg]);

    if (msg.role === 'admin') {
      setUnreadCount((n) => n + 1);
    }
  }, []);

  // ── Bootstrap: create/retrieve session + load history ───────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const visitorId = getOrCreateVisitorId();
        const cachedSession = localStorage.getItem(SESSION_KEY);
        let sid = cachedSession;

        if (!sid) {
          sid = await fetchOrCreateSession(visitorId);
          localStorage.setItem(SESSION_KEY, sid);
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
            if (token) verifyTashusToken(sid, token).catch(() => {});
          }
        }

        // Load full message history + exact circuit-breaker state from database
        const historyData = await fetchHistory(sid);
        if (cancelled) return;

        const history = historyData.messages || [];

        // Show user, assistant, admin messages; hide tool-call rows; include system messages (handoff banners)
        const historicMessages: ChatMessage[] = history
          .filter((m) => m.role !== 'tool')
          .map((m) => ({
            id: m.id || makeId(),
            role: m.role as ChatMessage['role'],
            content: m.content,
            adminDisplayName: (m as any).admin_display_name || undefined,
            createdAt: new Date(m.created_at),
          }));

        // Seed seen IDs from history
        historicMessages.forEach((m) => seenMessageIds.current.add(m.id));
        history.forEach((m) => seenMessageIds.current.add(m.id));

        if (history.length > 0) {
          const latest = history[history.length - 1].created_at;
          const latestMs = new Date(latest).getTime() - 1;
          lastAdminMsgAt.current = new Date(latestMs).toISOString();
        }

        // Restore exact database circuit-breaker state
        setPaused(historyData.is_ai_paused ?? false);
        setMessages(historicMessages);

      } catch (err) {
        console.error('[AI Widget] Failed to initialize:', err);
        if (!cancelled) setError('Could not connect to Tashus AI. Please try again.');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [jwtCookieName]);

  // ── Real-time SSE Control Stream + Fallback Polling ─────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    // 1. Connect persistent SSE control stream for instant admin message delivery
    const closeControlStream = openSessionControlStream(sessionId, (event) => {
      if (event.type === 'admin_message' || (event.type === 'message' && event.message?.role === 'admin')) {
        const payload = event.message || event;
        handleIncomingMessage({
          id: payload.id,
          role: payload.role || 'admin',
          content: payload.content,
          created_at: payload.created_at,
          admin_display_name: payload.admin_display_name || payload.adminDisplayName,
        });
      } else if (event.type === 'control') {
        if (typeof event.paused === 'boolean') {
          setPaused(event.paused);
        }
        if (event.message) {
          handleIncomingMessage({
            id: event.message.id,
            role: event.message.role || 'system',
            content: event.message.content,
            created_at: event.message.created_at,
          });
        }
      }
    });

    // 2. HTTP Polling — only runs during handoff (is_ai_paused=true) or as infrequent safety net
    // When AI is active: SSE handles all real-time delivery, poll at 15s just as a safety net
    // When in handoff: poll at 3s to ensure admin messages arrive even if SSE drops
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!active) return;

      const result = await pollSessionState(sessionId, lastAdminMsgAt.current);

      if (result && active) {
        if (result.is_ai_paused !== pausedRef.current) {
          setPaused(result.is_ai_paused);
        }

        const newMsgs = result.messages.filter(
          (m) => !seenMessageIds.current.has(m.id)
        );

        if (newMsgs.length > 0) {
          newMsgs.forEach((m) => {
            handleIncomingMessage({
              id: m.id,
              role: m.role,
              content: m.content,
              created_at: m.created_at,
              admin_display_name: m.admin_display_name,
            });
            if (m.created_at > lastAdminMsgAt.current) {
              lastAdminMsgAt.current = m.created_at;
            }
          });
        }
      }

      if (active) {
        // Poll frequently during handoff (admin messages need fast delivery)
        // Poll rarely when AI is active (SSE handles real-time, poll is just a safety net)
        const interval = pausedRef.current ? 3000 : 15000;
        timer = setTimeout(poll, interval);
      }
    };

    // Initial poll after 3s to let history load settle
    timer = setTimeout(poll, 3000);

    return () => {
      active = false;
      clearTimeout(timer);
      closeControlStream();
    };
  }, [sessionId, handleIncomingMessage]);

  // ── AI chat SSE stream ────────────────────────────────────────────────────────
  const send = useCallback(
    (text: string) => {
      if (!sessionId || streaming || !text.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: text.trim(),
        createdAt: new Date(),
      };

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
            case 'token': {
              const tokenText = (event as any).text || (event as any).token || (event as any).delta || '';
              accumulatedText += tokenText;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: accumulatedText, streaming: true }
                    : m
                )
              );
              break;
            }

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
              setMessages((prev) =>
                prev.filter((m) => !(m.toolName === event.tool && m.role === 'system'))
              );
              break;

            case 'admin_message': {
              const adminPayload = (event as any).message || event;
              handleIncomingMessage({
                id: adminPayload.id,
                role: adminPayload.role || 'admin',
                content: adminPayload.content,
                created_at: adminPayload.created_at,
                admin_display_name: adminPayload.admin_display_name || adminPayload.adminDisplayName,
              });
              break;
            }

            case 'paused':
              setPaused(true);
              setStreaming(false);
              setMessages((prev) =>
                prev
                  .filter((m) => !(m.id === assistantId && !m.content.trim()))
                  .map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
              );
              break;

            case 'released':
              setPaused(false);
              break;

            case 'done': {
              const doneText = (event as any).message || (event as any).text || accumulatedText;
              if (!doneText.trim()) {
                setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: doneText, streaming: false }
                      : m
                  )
                );
              }
              setStreaming(false);
              break;
            }

            case 'error': {
              const errText = (event as any).message || (event as any).error || 'An error occurred.';
              console.error('[AI Widget] SSE error:', errText);
              setError(errText);
              setStreaming(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, streaming: false } : m
                )
              );
              break;
            }
          }
        },

        onError(err) {
          if (controller.signal.aborted) return;
          console.error('[AI Widget] SSE connection error:', err);
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
