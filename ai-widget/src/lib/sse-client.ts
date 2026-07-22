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
 * Fetch full message history for a session.
 */
export async function fetchHistory(sessionId: string): Promise<Array<{
  id: string;
  role: string;
  content: string;
  created_at: string;
}>> {
  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/ai/chat/${sessionId}/history`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
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
