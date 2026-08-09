# AI Admin UI Enhancement Plan

> **Status:** APPROVED IMPLEMENTATION PLAN — Execution Ready
> **Constraint:** ALL existing functionality must remain intact. No deletions.
> **Scope:** UI polish + new features. Backend functionality unchanged.
> **Git:** Do NOT push until explicitly instructed.

---

## Summary of All Tasks

| # | Task | Risk | Files Changed |
|---|---|---|---|
| 1 | Disable AI Config page (read-only) | Very Low | config/page.tsx |
| 2 | Disable Test Chat page (read-only) | Very Low | test/page.tsx, layout.tsx |
| 3 | Token Bucket — split Available/Unavailable + Add/Delete keys | Medium | token-bucket/page.tsx + new API route |
| 4 | Settings page + profile name | Medium | new settings/page.tsx + layout.tsx + new API route |
| 5 | Vehicle cards in admin session chat | Low | sessions/page.tsx |
| 6 | Analytics — fix data accuracy + reset dev data | Low-Medium | analytics/page.tsx + token-usage/route.ts + SQL |
| 7 | Overall UI polish | Very Low | layout.tsx |

---

## Task 1: Disable AI Config Page

**File:** `ai-admin/src/app/(admin)/config/page.tsx`

**What:** Wrap the entire form in `<fieldset disabled>`, add a locked banner at the top, show a lock icon next to the nav item.

**How (safe):**
```typescript
const CONFIG_DISABLED = true; // set at top of file

// Add banner above loading spinner/form:
{CONFIG_DISABLED && (
  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-3 mb-4">
    <span>🔒</span>
    <div>
      <p className="font-semibold text-sm">Configuration Locked</p>
      <p className="text-xs opacity-80">Agent configuration is managed via code deployment. Contact a developer to make changes.</p>
    </div>
  </div>
)}

// Wrap entire form:
<fieldset disabled={CONFIG_DISABLED} className={CONFIG_DISABLED ? 'opacity-50 pointer-events-none select-none' : ''}>
  {/* existing form unchanged */}
</fieldset>
```

**Nav change in layout.tsx:** Add `🔒` badge next to "Agent Config" link when `CONFIG_DISABLED`.

---

## Task 2: Disable Test Chat Page

**File:** `ai-admin/src/app/(admin)/test/page.tsx`

**What:** Add a "disabled" overlay that blocks the entire page with a clear message. Do NOT delete any code.

**How (safe):**
```typescript
const TEST_DISABLED = true; // top of file

// At the very top of the return, before everything else:
if (TEST_DISABLED) {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🚧</div>
        <h2 className="text-2xl font-bold text-white mb-3">Test Console Disabled</h2>
        <p className="text-[#94A3B8] text-sm">
          The test chat console is currently disabled. It will be re-enabled for development use only.
        </p>
      </div>
    </div>
  );
}

// The rest of the existing component code remains untouched below
```

**Nav change in layout.tsx:** Grey out the "Test Chat" nav item and add a `🚧` badge.

---

## Task 3: Token Bucket — Available/Unavailable Split + Add/Delete Keys

### 3a — UI Split (Low Risk)

**File:** `ai-admin/src/app/(admin)/token-bucket/page.tsx`

Split the keys list into two sections:

**Section 1 — "🔴 Unavailable / Rate-Limited" (top, red)**
- `key.available === false` OR `key.cooldownSeconds > 0`
- Shows: key number, masked key, cooldown countdown bar, reason, failure count
- Pulsing red badge with count

**Section 2 — "🟢 Active Keys" (bottom, green)**
- `key.available === true` AND `key.cooldownSeconds === 0`
- Shows existing layout

No backend change needed — data already comes from `/api/admin/token-bucket`.

### 3b — Add/Delete Keys

**Problem:** `GROK_API_KEYS` is an environment variable — can't be edited from UI without infrastructure access.

**Solution:** Store additional keys in a new Supabase table. Backend merges env keys + DB keys.

**Safe SQL (run manually in Supabase SQL editor):**
```sql
-- SAFE: Only creates a new table. Does NOT touch any existing tables.
-- Run this in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS ai_groq_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text,                          -- Optional human label e.g. "Key 1 - Account A"
  full_key    text NOT NULL,                 -- The actual API key (service role only)
  masked_key  text NOT NULL,                 -- Last 8 chars e.g. "...uKAXpp"
  is_active   boolean DEFAULT true,
  source      text DEFAULT 'ui',             -- 'ui' | 'env' (env keys shown read-only)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- RLS: Only service role can access (admin backend uses service role key)
ALTER TABLE ai_groq_keys ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (service role bypasses RLS automatically)
-- No policies needed for service role.

-- Add comment for documentation
COMMENT ON TABLE ai_groq_keys IS 'Groq API keys managed via the admin UI. Merged with GROK_API_KEYS env var at runtime.';
```

**New API routes (ai-admin):**
- `GET /api/admin/groq-keys` — returns keys (masked + metadata, NOT full_key)
- `POST /api/admin/groq-keys` — add new key `{ key: string, label?: string }`
- `DELETE /api/admin/groq-keys/[id]` — soft delete (sets `is_active = false`)

**Backend change (ai-backend/src/lib/env.ts or token-bucket.ts):**
- On startup, read from DB + env var, de-duplicate by last 8 chars
- Cache merged list in Redis for 60s (same pattern as agent config)

**UI additions:**
- "Add Key" button → modal with text input for key + optional label
- Delete button (trash icon) on each key row → confirm dialog → soft delete
- Keys from ENV shown with "ENV" badge (read-only, no delete)
- Keys from UI shown with "UI" badge (deletable)

---

## Task 4: Settings Page + Profile Name

### 4a — New Settings Page

**File:** `ai-admin/src/app/(admin)/settings/page.tsx` (NEW)

**Sections:**
1. **Profile** — Display Name (editable), Email (read-only from JWT)
2. **Account Security** — Change Password (future, greyed out with "Coming Soon")

**Profile update API:**
`PATCH /api/admin/settings/profile` — updates `ai_admin_users.display_name`

**File:** `ai-admin/src/app/api/admin/settings/profile/route.ts` (NEW)
```typescript
// PATCH: { displayName: string }
// → UPDATE ai_admin_users SET display_name = $1, updated_at = now()
//   WHERE id = admin.userId
// Uses resolveAdmin() for auth
```

No SQL schema change needed — `display_name` column already exists in `ai_admin_users`.

### 4b — Profile Name in Sidebar

**File:** `ai-admin/src/app/(admin)/layout.tsx`

Currently shows hardcoded "Admin User". Change to read display name from the admin JWT cookie client-side:

```typescript
// Decode JWT cookie (already installed: jose library)
import { decodeJwt } from 'jose';

// In component:
const [adminName, setAdminName] = useState('Admin');
useEffect(() => {
  try {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('admin_access_token='));
    if (cookie) {
      const token = cookie.split('=').slice(1).join('=').trim();
      const payload = decodeJwt(token) as any;
      setAdminName(payload.displayName || 'Admin');
    }
  } catch {}
}, []);
```

### 4c — Navigation Addition

Add "Settings" before the logout button in the sidebar nav:
```
⚙️  Settings    → /settings
```

---

## Task 5: Vehicle Cards in Admin Session Chat

**File:** `ai-admin/src/app/(admin)/sessions/page.tsx` — `MsgBubble` component

**Problem:** `[VEHICLE: {...}]` tags show as raw text in admin chat view.

**Solution:** Add a `parseMessageContent()` function that:
1. Detects `[VEHICLE: {...}]` patterns
2. Renders compact horizontal vehicle cards inline

**Admin vehicle card design (compact, fits 3 per row):**
```
┌──────────────────────────────────────────────────┐
│  [60px photo]  TOYOTA Hiace · SUV                │
│                $50/day · 5 seats · Auto           │
│                Sydney, NSW · ⭐ 4.6               │
└──────────────────────────────────────────────────┘
```

This is a **pure frontend change** — no API, no backend, no DB changes.

**Important:** The `test/page.tsx` already has `parseRichContent()` and `TestVehicleCard` with full vehicle card logic. We copy/adapt this pattern for `sessions/page.tsx`.

---

## Task 6: Analytics — Fix Data Accuracy

### 6a — Fix Token Cost Rates

**File:** `ai-admin/src/app/api/admin/analytics/token-usage/route.ts`

**Problem:** Cost rates use old Groq pricing. The model is now `openai/gpt-oss-120b` at $0.15/$0.60.

```typescript
// BEFORE (wrong prices)
const TOKEN_COST: Record<string, { prompt: number; completion: number }> = {
  groq:       { prompt: 0.59  / 1_000_000, completion: 0.79  / 1_000_000 },
  openrouter: { prompt: 0.88  / 1_000_000, completion: 0.88  / 1_000_000 },
  anthropic:  { prompt: 3.00  / 1_000_000, completion: 15.00 / 1_000_000 },
};

// AFTER (correct prices for gpt-oss-120b)
const TOKEN_COST: Record<string, { prompt: number; completion: number }> = {
  groq:       { prompt: 0.15  / 1_000_000, completion: 0.60  / 1_000_000 }, // gpt-oss-120b
  openrouter: { prompt: 0.15  / 1_000_000, completion: 0.60  / 1_000_000 }, // same model
  anthropic:  { prompt: 3.00  / 1_000_000, completion: 15.00 / 1_000_000 }, // claude-sonnet-4-5
};
```

### 6b — Fix analytics overview using apiFetch

**File:** `ai-admin/src/app/(admin)/analytics/page.tsx`

The overview fetch uses plain `fetch()` not `apiFetch()` — will fail with 401 on expired tokens:
```typescript
// BEFORE
const [overviewRes, toolRes] = await Promise.all([
  fetch('/api/admin/analytics/overview'),
  fetch('/api/admin/audit/tool-calls'),
]);

// AFTER
const [overviewRes, toolRes] = await Promise.all([
  apiFetch('/api/admin/analytics/overview'),
  apiFetch('/api/admin/audit/tool-calls'),
]);
```

### 6c — Fix token-usage route auth pattern

**File:** `ai-admin/src/app/api/admin/analytics/token-usage/route.ts`

Uses old `verifyJwt` pattern instead of `resolveAdmin`. Update to match other routes.

### 6d — Reset Dev/Test Data (OPTIONAL — Safe SQL)

During development, many test sessions and tool call logs were created with `session_id = NULL` or with test session IDs. These pollute the analytics.

**Safe SQL to clean test data (run manually, ONLY if you want to reset):**
```sql
-- SAFE: Only deletes rows where session_id IS NULL (test/orphaned rows)
-- These are development artifacts — no real user session has session_id = NULL
-- Run in Supabase SQL Editor

-- Preview first (SELECT before DELETE):
SELECT COUNT(*) FROM ai_tool_call_logs WHERE session_id IS NULL;
SELECT COUNT(*) FROM ai_chat_messages WHERE session_id IS NULL;

-- If counts look right, then delete:
-- DELETE FROM ai_tool_call_logs WHERE session_id IS NULL;
-- DELETE FROM ai_chat_messages WHERE session_id IS NULL;

-- DO NOT run the DELETE lines until you've reviewed the SELECT counts above.
-- Comment them out in this plan until ready.
```

**Also safe — delete test sessions (sessions created during development):**
```sql
-- Preview first:
SELECT id, visitor_id, started_at
FROM ai_chat_sessions
WHERE visitor_id LIKE 'test-%'
   OR visitor_id LIKE 'visitor_debug%'
   OR visitor_id LIKE 'null-fix%'
   OR visitor_id LIKE 'local-debug%'
ORDER BY started_at DESC;

-- If the list looks correct:
-- DELETE FROM ai_chat_sessions
-- WHERE visitor_id LIKE 'test-%'
--    OR visitor_id LIKE 'visitor_debug%'
--    OR visitor_id LIKE 'null-fix%'
--    OR visitor_id LIKE 'local-debug%';
-- (Cascade delete will also remove ai_chat_messages and ai_tool_call_logs for those sessions)
```

**⚠️ ALWAYS run the SELECT first. Only run DELETE after confirming the counts.**

---

## Task 7: Overall UI Polish

**File:** `ai-admin/src/app/(admin)/layout.tsx`

**Changes (all cosmetic, zero functional impact):**

1. **Profile name from JWT** — read `displayName` from `admin_access_token` cookie (see Task 4b)
2. **Settings nav item** — add before logout
3. **Agent Config nav item** — add `🔒` badge when disabled
4. **Test Chat nav item** — add `🚧` badge when disabled, grey out text
5. **Active page title** — improve title parsing (currently just splits on `/`)

---

## Safe Implementation Order

```
Task 1 → Disable config (2 min, zero risk)
Task 2 → Disable test chat (2 min, zero risk)
Task 6a → Fix token cost rates (2 min, low risk — just constants)
Task 6b → Fix analytics apiFetch (1 min, low risk)
Task 6c → Fix token-usage auth (2 min, low risk)
Task 5 → Vehicle cards in session chat (30 min, frontend only)
Task 4 → Settings page + profile name (45 min, new files only)
Task 7 → Layout polish (15 min, cosmetic only)
Task 3 → Token bucket add/delete (requires SQL first) (60 min)
Task 6d → Run SQL reset (manual, review first)
```

---

## Files Changed Summary

| File | Task(s) | Change Type |
|---|---|---|
| `(admin)/config/page.tsx` | 1 | Add disabled overlay |
| `(admin)/test/page.tsx` | 2 | Add disabled early return |
| `(admin)/layout.tsx` | 2, 4b, 7 | Profile name + nav badges |
| `(admin)/token-bucket/page.tsx` | 3a | UI split sections |
| NEW `(admin)/settings/page.tsx` | 4 | New settings page |
| NEW `api/admin/settings/profile/route.ts` | 4 | PATCH profile |
| NEW `api/admin/groq-keys/route.ts` | 3b | CRUD for keys |
| `(admin)/sessions/page.tsx` | 5 | Parse vehicle tags |
| `(admin)/analytics/page.tsx` | 6b | Fix apiFetch |
| `api/admin/analytics/token-usage/route.ts` | 6a, 6c | Fix prices + auth |

## Files NOT Changed (ever)

- ALL ai-backend source files
- ALL ai-widget source files
- ALL existing database tables (except new `ai_groq_keys` table)
- ALL authentication logic (using resolveAdmin pattern)
- Existing API routes (except addons)

---

## SQL Summary

| SQL | Risk | When to Run |
|---|---|---|
| CREATE TABLE ai_groq_keys | Safe (new table only) | Before Task 3b implementation |
| DELETE test sessions | Medium (destructive but targeted) | Review SELECT first, then only if approved |
| DELETE NULL session logs | Low (orphaned dev data) | Review SELECT first, then only if approved |

---

*Plan created: 2026-08-09 | Ready to implement task by task on instruction*
*No git push until explicitly instructed*
