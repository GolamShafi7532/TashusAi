import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { StreamEvent } from './types';

function getBackendUrl(): string {
  if (typeof window !== 'undefined' && (window as any).tashusAiConfig?.backendUrl) {
    return (window as any).tashusAiConfig.backendUrl;
  }
  return typeof __AI_BACKEND_URL__ !== 'undefined'
    ? __AI_BACKEND_URL__
    : 'http://localhost:3001';
}

const BACKEND_URL = getBackendUrl();

/**
 * Detect the user's IANA timezone and current local time.
 * Used to give the LLM accurate "today / tomorrow / this weekend" context.
 */
function buildUserContext() {
  const now = new Date();
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,  // e.g. "Australia/Sydney"
    localTime: now.toISOString(),                                // UTC ISO string
    timezoneOffset: now.getTimezoneOffset(),                     // e.g. -600 for AEST (UTC+10)
  };
}

/**
 * Low-level SSE client that wraps @microsoft/fetch-event-source.
 * Uses POST (not GET) because we send a body with each message.
 */
export function openSSEStream(
  sessionId: string,
  message: string,
  abortController: AbortController,
  handlers: {
    onEvent: (event: StreamEvent) => void;
    onError: (err: unknown) => void;
    onClose: () => void;
  }
): void {
  const backendUrl = getBackendUrl();
  fetchEventSource(`${backendUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, userContext: buildUserContext() }),
    signal: abortController.signal,
    credentials: 'include',
    openWhenHidden: true, // keep alive when tab is backgrounded

    onmessage(ev) {
      if (!ev.data) return;
      try {
        const rawObj = JSON.parse(ev.data);
        const eventType = rawObj.type || ev.event || 'token';
        const parsed: StreamEvent = { type: eventType, ...rawObj };
        handlers.onEvent(parsed);
      } catch {
        // Ignore malformed events
      }
    },

    onerror(err) {
      handlers.onError(err);
      throw err; // prevent fetchEventSource from auto-retrying on fatal errors
    },

    onclose() {
      handlers.onClose();
    },
  });
}

/**
 * Fetch session ID from the backend (creates or retrieves).
 */
export async function fetchOrCreateSession(visitorId: string): Promise<string> {
  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/ai/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ visitorId }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  const data = await res.json();
  return data.sessionId;
}

/**
 * Fetch full message history and circuit-breaker state for a session.
 */
export async function fetchHistory(sessionId: string): Promise<{
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    admin_display_name?: string;
  }>;
  is_ai_paused: boolean;
  status: string;
}> {
  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/ai/chat/${sessionId}/history`, {
    credentials: 'include',
  });
  if (!res.ok) return { messages: [], is_ai_paused: false, status: 'active' };
  const data = await res.json();
  return {
    messages: data.messages || [],
    is_ai_paused: data.is_ai_paused ?? false,
    status: data.status ?? 'active',
  };
}

/**
 * Real-time SSE stream listener for background admin messages and control events.
 */
export function openSessionControlStream(
  sessionId: string,
  onEvent: (event: any) => void
): () => void {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/ai/session/${sessionId}/stream`;
  let es: EventSource | null = null;

  try {
    es = new EventSource(url, { withCredentials: true });

    es.addEventListener('admin_message', (ev) => {
      try { onEvent({ type: 'admin_message', ...JSON.parse(ev.data) }); } catch {}
    });

    es.addEventListener('control', (ev) => {
      try { onEvent({ type: 'control', ...JSON.parse(ev.data) }); } catch {}
    });

    es.addEventListener('message', (ev) => {
      try { onEvent({ type: 'message', ...JSON.parse(ev.data) }); } catch {}
    });
  } catch (e) {
    console.warn('[SessionControlStream] Failed to connect SSE stream:', e);
  }

  return () => {
    if (es) es.close();
  };
}

/**
 * Poll session state for admin messages and circuit-breaker changes.
 * Called every 2 seconds by the widget to receive admin messages reliably as fallback.
 */
export async function pollSessionState(
  sessionId: string,
  since: string
): Promise<{
  is_ai_paused: boolean;
  status: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    admin_display_name?: string;
  }>;
} | null> {
  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(
      `${backendUrl}/api/ai/session/${sessionId}/poll?since=${encodeURIComponent(since)}`,
      { credentials: 'include' }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Verify a Tashus JWT token and associate it with the current session.
 */
export async function verifyTashusToken(
  sessionId: string,
  token: string
): Promise<void> {
  try {
    const backendUrl = getBackendUrl();
    await fetch(`${backendUrl}/api/ai/verify-tashus-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId, token }),
    });
  } catch {
    // Non-critical — widget still works without JWT passthrough
  }
}
