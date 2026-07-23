# Admin Chat Management & Human Handoff System

> **Status:** ✅ Production Ready  
> **Version:** 2.0  
> **Last Verified:** 2026-07-13 (full code audit)  
> **Canonical source files audited:**
> - `ai-admin/src/app/(admin)/sessions/page.tsx`
> - `ai-admin/src/app/api/admin/sessions/[id]/{messages,takeover,release}/route.ts`
> - `ai-backend/src/app/api/admin/sessions/{route.ts,[id]/route.ts,[id]/message/route.ts,[id]/resume/route.ts}`
> - `ai-backend/src/app/api/admin/notifications/stream/route.ts`
> - `ai-backend/src/app/api/ai/session/[id]/{request-handoff,stream}/route.ts`
> - `ai-backend/src/lib/redis.ts`

---

## 1. Architecture Overview

The admin chat management system spans two separate Next.js applications that communicate through the shared Supabase database and Redis pub/sub bus.

```
┌─────────────────────────┐          ┌──────────────────────────────────────┐
│   AI WIDGET (Browser)    │          │    AI BACKEND (ai-backend)            │
│                          │          │                                       │
│  POST request-handoff ──►│──────────│► Sets is_ai_paused=true               │
│  GET  session/:id/stream │◄─────────│◄ Redis channel: session:{id}:control  │
└─────────────────────────┘          └──────────────────────────────────────┘
                                                      │
                                              Supabase DB + Redis
                                                      │
                                      ┌───────────────▼──────────────────────┐
                                      │    AI ADMIN PANEL (ai-admin)          │
                                      │                                       │
                                      │  GET  /api/admin/sessions             │
                                      │  GET  /api/admin/sessions/:id         │
                                      │  POST /api/admin/sessions/:id/takeover│
                                      │  POST /api/admin/sessions/:id/messages│
                                      │  POST /api/admin/sessions/:id/release │
                                      │  GET  /api/admin/notifications/stream │
                                      └──────────────────────────────────────┘
```

**Important:** `ai-admin` has its own proxy API routes (under `ai-admin/src/app/api/`) that talk to Supabase and Redis directly. They do **not** proxy through `ai-backend`. The `ai-backend` admin routes (`/api/admin/sessions/[id]/message` and `/api/admin/sessions/[id]/resume`) are a separate, parallel implementation — the admin panel UI does **not** call them; it uses its own routes.

---

## 2. Database Fields (Verified)

**Table: `ai_chat_sessions`**

| Column | Type | Role in handoff |
|---|---|---|
| `is_ai_paused` | boolean | **Circuit breaker.** When `true`, the orchestrator skips LLM entirely. |
| `status` | text | `'active'` → `'handed_off'` on takeover. Reset to `'active'` on release. |
| `assigned_admin_id` | uuid | Set on takeover. Cleared to `null` on release. |

**Table: `ai_chat_messages`** — roles used in handoff:

| `role` | When inserted |
|---|---|
| `'user'` | Every user message (even while paused — still saved for admin visibility) |
| `'assistant'` | AI replies (only when `is_ai_paused = false`) |
| `'admin'` | Admin replies during handoff (`sent_by_admin_id` populated) |
| `'system'` | State-change announcements visible to both widget and admin |

---

## 3. API Routes — Exact Contracts

### 3.1 Admin Panel Proxy Routes (`ai-admin`)

These are the routes the UI actually calls. Auth is resolved via `isLocalDevMode()` in dev and `getAdminFromRequest()` in production.

---

**`GET /api/admin/sessions`**

Query params: `limit` (default 50), `handoff=true`, `search` (filtered client-side after fetch).

Response:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "visitor_id": "visitor_abc123",
      "status": "handed_off",
      "is_ai_paused": true,
      "channel": "widget",
      "last_message": "I need to speak to a human",
      "message_count": 12,
      "last_message_at": "2026-07-13T10:45:00Z",
      "started_at": "2026-07-13T10:30:00Z",
      "admin_name": "John Smith",
      "assigned_admin_id": "uuid"
    }
  ],
  "pagination": { "total": 145, "page": 1, "limit": 50, "total_pages": 3 },
  "stats": {
    "active": 23,
    "handed_off": 5,
    "closed_today": 87
  }
}
```

Sort order: `is_ai_paused DESC`, then `last_message_at DESC` (handoffs float to top).

---

**`GET /api/admin/sessions/:id`**

Returns full session + all messages filtered to `['user', 'assistant', 'admin', 'system']`, ordered chronologically. Admin messages include `admin_name` and `admin_email` from `ai_admin_users`.

Response shape:
```json
{
  "session": {
    "id": "uuid",
    "visitor_id": "visitor_abc123",
    "status": "handed_off",
    "is_ai_paused": true,
    "assigned_admin_id": "uuid",
    "admin_name": "John Smith",
    "started_at": "2026-07-13T10:30:00Z",
    "last_message_at": "2026-07-13T10:45:00Z",
    "metadata": { "page_url": "https://tashus.com/search" }
  },
  "messages": [
    { "id": "uuid", "role": "user",      "content": "Hi",           "created_at": "..." },
    { "id": "uuid", "role": "assistant", "content": "Hello!",        "created_at": "..." },
    { "id": "uuid", "role": "system",    "content": "🤝 Connecting...", "created_at": "..." },
    { "id": "uuid", "role": "admin",     "content": "I'm here",      "created_at": "...", "admin_name": "John", "admin_email": "john@..." }
  ],
  "message_count": 4
}
```

---

**`POST /api/admin/sessions/:id/takeover`**

No request body required (admin identity resolved from session/dev mode).

Actions:
1. Sets `is_ai_paused = true`, `status = 'handed_off'`, `assigned_admin_id = admin.userId`
2. Inserts `role='system'` message: `"{admin.displayName} has joined the conversation. The AI is now paused."`
3. Publishes to Redis channel `session:{id}:control`:
   ```json
   { "type": "control", "paused": true, "message": { "role": "system", "content": "..." } }
   ```

Response: `{ "success": true, "session": { ...updated session } }`

---

**`POST /api/admin/sessions/:id/messages`**

Request body: `{ "content": "Hi, I'm here to help!" }`

Guards: Returns `HTTP 423` if `is_ai_paused = false` (AI is active — must takeover first).

Actions:
1. Inserts `role='admin'` message with `sent_by_admin_id`
2. Updates `session.last_message_at`
3. Publishes to Redis channel `session:{id}:control`:
   ```json
   {
     "type": "message",
     "message": {
       "id": "uuid",
       "role": "admin",
       "content": "Hi, I'm here to help!",
       "admin_display_name": "John Smith",
       "created_at": "2026-07-13T10:47:00Z"
     }
   }
   ```

Response: `{ "success": true, "message": { ...inserted message } }`

---

**`POST /api/admin/sessions/:id/release`**

No request body required.

Actions:
1. Sets `is_ai_paused = false`, `status = 'active'`, `assigned_admin_id = null`
2. Inserts `role='system'` message: `"✅ Human agent left. Tashus AI has resumed — feel free to continue!"`
3. Publishes to Redis channel `session:{id}:control`:
   ```json
   { "type": "control", "paused": false, "message": { "role": "system", "content": "..." } }
   ```

Response: `{ "success": true, "session": { ...updated session } }`

---

**`GET /api/admin/notifications/stream`**

SSE endpoint. Subscribes to Redis channel `admin:notifications`.

Event types received:
- `connected` — on first connect: `{ "message": "...", "timestamp": "..." }`
- `handoff_requested` — `{ "type": "handoff_requested", "session_id": "...", "visitor_id": "...", "reason": "user_requested", "timestamp": "..." }`
- `heartbeat` — every 30s: `{ "timestamp": "..." }`

The admin UI uses this SSE to call `fetchSessions(true)` (silent refresh) on `handoff_requested` events.

---

### 3.2 Widget-Facing Routes (`ai-backend`)

**`POST /api/ai/session/:id/request-handoff`**

Request body: `{ "reason": "user_requested" }` (reason is optional, defaults to `"user_requested"`)

Idempotent — if already paused, returns success immediately.

Actions:
1. Sets `is_ai_paused = true`, `status = 'handed_off'`
2. Inserts `role='system'` message: `"🤝 Connecting you to a human agent — please hold on for a moment."`
3. Publishes to `session:{id}:control` (widget SSE): `{ "type": "control", "paused": true, "message": {...} }`
4. Publishes to `admin:notifications` (all admin dashboards): `{ "type": "handoff_requested", ... }`

Response: `{ "success": true, "message": "An agent will be with you shortly." }`

---

**`GET /api/ai/session/:id/stream`**

Widget SSE endpoint. Subscribes to Redis channel `session:{id}:control` (exact key from `buildSessionControlChannel(sessionId)` in `redis.ts`).

Event types the widget receives:
- `connected` — initial confirmation
- `control` — state change: `{ "type": "control", "paused": true|false, "message": { "role": "system", "content": "..." } }`
- `message` — admin message: `{ "type": "message", "message": { "id": "...", "role": "admin", "content": "...", "admin_display_name": "...", "created_at": "..." } }`
- `heartbeat` — every 25s

---

## 4. Admin Panel UI — Exact Implementation

**Route:** `/sessions` in `ai-admin`  
**File:** `ai-admin/src/app/(admin)/sessions/page.tsx` (single file, all components inlined)

### Layout

**Two-panel layout** (not three-panel — there is no separate tab sidebar column):

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  SESSIONS PAGE  (calc(100vh - 8rem), border-radius: 16px)  │
├──────────────────────────┬─────────────────────────────────────────────────┤
│  LEFT PANEL (width: 280px│  RIGHT PANEL (flex: 1)                          │
│  background: #0F161E)    │  background: #090D11)                           │
│                          │                                                 │
│  ┌────────────┐          │  IF no session selected:                        │
│  │ Stats strip│          │    "Select a conversation" placeholder          │
│  │ Active | ← │          │                                                 │
│  │ Handoff    │          │  IF session selected (InlineChatPanel):         │
│  └────────────┘          │    ┌──────────────────────────────────────────┐ │
│                          │    │ Header: visitor_id + status badge        │ │
│  Tabs:                   │    │ [● AI Active] or [● Handoff Mode]        │ │
│  [All Chats] [Handoff 🔴]│    │ Actions: [Take Over] or [▶ Resume AI]    │ │
│                          │    │          [Close]                         │ │
│  [Search input]          │    ├──────────────────────────────────────────┤ │
│                          │    │ Message thread (scrollable)              │ │
│  ┌──────────────────────┐│    │                                          │ │
│  │ Session card         ││    │ user, assistant, admin, system bubbles   │ │
│  │ visitor_id + time    ││    │                                          │ │
│  │ last message preview ││    │                                          │ │
│  └──────────────────────┘│    ├──────────────────────────────────────────┤ │
│  ...                     │    │ Composer (only when is_ai_paused=true):  │ │
│                          │    │ [textarea] [Send]                        │ │
│                          │    │                                          │ │
│                          │    │ When AI active: "Click Take Over..."     │ │
│                          │    └──────────────────────────────────────────┘ │
└──────────────────────────┴─────────────────────────────────────────────────┘
```

### Session Card (`SessionCard` component)

- Avatar = first 2 chars of `visitor_id`, uppercase
- Orange avatar + pulsing orange dot if `is_ai_paused || status === 'handed_off'`
- Teal avatar otherwise
- Shows `admin_name` in teal below last message if session is assigned
- Active state: teal left border `3px solid #20B9BE`, teal background `rgba(32,185,190,0.1)`

### Stats Strip

Two stat cards: `Active` (teal value) and `Handoff` (orange value). Values come from `stats.active` and `stats.handed_off` in the API response.

### Tabs

- `All Chats` tab — fetches without filter
- `Handoff` tab — fetches with `?handoff=true`; shows pulsing orange badge with `stats.handed_off` count
- Tab switching triggers `fetchSessions()`

### Data Refresh Strategy

| Trigger | Method |
|---|---|
| Tab change or search change | Full `fetchSessions()` (shows spinner) |
| SSE `handoff_requested` event | `fetchSessions(true)` (silent, no spinner) |
| Auto-poll | `setInterval(() => fetchSessions(true), 10000)` — every 10 seconds |
| After admin action (takeover/release/send) | `fetch_(true)` called by `InlineChatPanel` |

SSE reconnect: on `onerror`, closes EventSource and retries after 5 seconds.

### InlineChatPanel (right panel when session selected)

Polls `GET /api/admin/sessions/:id` every 3 seconds (plus after every action).

Message bubble roles:
- `user` — right-aligned, teal/blue background
- `assistant` — left-aligned, labeled "AI"
- `admin` — left-aligned, orange badge with `admin_name`
- `system` — centered, subdued banner style

Header action buttons:
- `is_ai_paused = true`: shows **`▶ Resume AI`** button (calls `/release`) + `Close` button
- `is_ai_paused = false`: shows **`Take Over`** button (orange) + `Close` button
- `status = 'closed'`: hides both action buttons

Composer (textarea + Send button):
- **Only rendered when `is_ai_paused = true && status !== 'closed'`**
- When AI is active: shows a locked state with message "AI is active. Click **Take Over** to respond."
- Enter to send, Shift+Enter for newline
- Auto-grows up to `120px` max height
- Send button calls `POST /api/admin/sessions/:id/messages` with `{ content: text.trim() }`

`Close` button calls `PATCH /api/admin/sessions/:id` with `{ status: 'closed' }`.

---

## 5. Circuit Breaker — Exact Mechanics

### Check in Orchestrator

The orchestrator checks `is_ai_paused` **before every LLM call**. When `true`:
- User message is still inserted to `ai_chat_messages` (admin can see it)
- No LLM call is made
- No assistant message is generated
- The widget receives no AI reply

### State Machine

```
ACTIVE  ──[User clicks "Speak to Human"]──────►  HANDED_OFF
(AI responds)   POST request-handoff              (AI silent)
                sets is_ai_paused=true            
                                                  │
                                         Admin opens session
                                         POST /takeover
                                         sets assigned_admin_id
                                                  │
                                         Admin types messages
                                         POST /messages
                                         → widget receives via SSE
                                                  │
                                         Admin clicks "Resume AI"
                                         POST /release
                                         ◄──────────────────────
                                         sets is_ai_paused=false
                                         clears assigned_admin_id
                                         status → 'active'
```

### Redis Channel

The single canonical Redis channel name is built by `buildSessionControlChannel(sessionId)` in `ai-backend/src/lib/redis.ts`:

```typescript
export function buildSessionControlChannel(sessionId: string): string {
  return `session:${sessionId}:control`;
}
```

This same function is imported and used in:
- `ai-backend` — `request-handoff/route.ts` (publisher)
- `ai-backend` — `session/[id]/stream/route.ts` (subscriber — widget SSE)
- `ai-admin` — `messages/route.ts`, `takeover/route.ts`, `release/route.ts` (publishers)

Admin notifications use a separate hardcoded channel: `'admin:notifications'`

---

## 6. Auth Pattern

Admin routes in `ai-admin` use this pattern:

```typescript
async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  return getAdminFromRequest(req);
}
```

`isLocalDevMode()` — returns `true` in dev when `SKIP_ADMIN_AUTH=true` in env.

In production, `getAdminFromRequest()` validates the session cookie against `ai_admin_users`.

---

## 7. Notification SSE — Admin Dashboard

**File:** `ai-backend/src/app/api/admin/notifications/stream/route.ts`

The SSE stream is consumed directly by the admin panel via the browser `EventSource` API:

```typescript
// In sessions/page.tsx
const es = new EventSource('/api/admin/notifications/stream');
es.addEventListener('handoff_requested', () => fetchSessions(true));
es.onerror = () => { es.close(); retryT = setTimeout(connect, 5000); };
```

Note: the event listener is registered as `'handoff_requested'` (named event), not `'message'`, because the SSE stream sends `event: handoff_requested` frames.

---

## 8. Implemented ✅ vs Not Implemented ❌

### ✅ Implemented and Verified

| Feature | Location |
|---|---|
| Two-panel session inbox (list + inline chat) | `ai-admin/sessions/page.tsx` |
| Session list with stats (active / handed_off) | `ai-admin/sessions/page.tsx` |
| All / Handoff tabs with live badge count | `ai-admin/sessions/page.tsx` |
| Search (client-side filter on visitor_id / session id) | `ai-admin/sessions/page.tsx` |
| Session cards with orange pulsing dot for handoff | `SessionCard` component |
| 10-second auto-refresh + SSE instant refresh | `useEffect` timers |
| SSE reconnect with 5-second retry | `connect()` in `useEffect` |
| Inline chat panel with full message thread | `InlineChatPanel` component |
| Role-based message bubble rendering | `MsgBubble` component |
| Take Over action → sets `is_ai_paused=true` + assigns admin | `/takeover/route.ts` |
| Resume AI (Release) → clears circuit breaker + `assigned_admin_id=null` | `/release/route.ts` |
| Admin composer (only when `is_ai_paused=true`) | `InlineChatPanel` composer |
| Enter-to-send, Shift+Enter newline, auto-grow textarea | `InlineChatPanel` composer |
| Close session action (PATCH to set `status='closed'`) | `handleClose` |
| Admin messages delivered to widget via Redis pub/sub | `/messages/route.ts` |
| System messages on takeover and release | Both route handlers |
| Handoff notifications to all admin dashboards | `request-handoff/route.ts` |
| SSE stream for widget (admin messages in real-time) | `session/[id]/stream/route.ts` |
| Circuit breaker in orchestrator (`is_ai_paused` check) | `orchestrator.ts` |
| Local dev mode (no auth) | `isLocalDevMode()` pattern |
| HandoffNotificationProvider in admin layout | `ai-admin/layout.tsx` |

### ❌ Not Yet Implemented

| Feature | Notes |
|---|---|
| `PATCH /api/admin/sessions/:id` for `status='closed'` | Called by UI but route may not exist in `ai-admin` — needs verification |
| Session `[id]` detail page (`/sessions/[id]/page.tsx`) | File exists but content not audited |
| Advanced search (server-side full-text search) | Currently client-side only |
| Canned responses / quick replies | Planned (V3.0) |
| Session tagging / categorisation | Planned (V3.0) |
| Analytics dashboard (response time, resolution rate) | Planned (V3.0) |
| Team collaboration (transfer session, internal notes) | Planned (V3.0) |
| Multi-channel (email, voice, social) | Placeholder tables only |

---

## 9. V3.0 Enhancement Roadmap

### Phase 1 — Close Session Route
Verify or create `PATCH /api/admin/sessions/:id` to set `status='closed'` and `closed_at=now()`.

### Phase 2 — Advanced Search
Move search server-side with `ilike` filter on `visitor_id` in Supabase query instead of client-side `Array.filter()`.

### Phase 3 — Canned Responses
Admin can save and insert pre-written replies. Store in `ai_knowledge_base` with `entry_type='instruction'` or a new `canned_responses` table.

### Phase 4 — Analytics
Session resolution time (time from `handed_off` → `active`), admin response latency (time from handoff to first admin message), daily handoff rate.

### Phase 5 — Session Tags
Add `tags text[]` to `ai_chat_sessions`. Allow admins to categorise sessions (billing, booking, technical, etc.).

### Phase 6 — Transfer Session
Publish a `transfer` event on the session's Redis control channel so the new admin's dashboard refreshes and the old one drops the session.

---

*Verified against source code 2026-07-13. Update this document whenever the session routes, circuit breaker logic, or UI components change.*
