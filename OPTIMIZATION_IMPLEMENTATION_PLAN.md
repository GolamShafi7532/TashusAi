# Tashus AI Agent — Optimization Implementation Plan
# Phases 1–5

> **Version:** 3.0 — ALL PHASES COMPLETE
> **Created:** 2026-08-03  
> **Completed:** 2026-08-04
> **Commit:** `a9f661d` (main branch)
> **Primary LLM:** llama-3.3-70b-versatile via Groq — NOT migrated

---

## Status Overview

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Fallback Reliability & RAG Thresholds | ✅ COMPLETE |
| Phase 2 | Data Accuracy & Token Scoping | ✅ COMPLETE |
| Phase 3 | Short-Circuit Formatting | ✅ COMPLETE |
| Phase 4 | Vercel Latency & Connection Optimization | ✅ COMPLETE |
| Phase 5 | Graceful Rate Limit Handoff | ✅ COMPLETE |

---

## ✅ Phase 1: Fallback Reliability & RAG Thresholds

### Task 1.1 — Anthropic fallback model updated ✅
**File:** `ai-backend/src/agent/anthropic.ts`

Changed `claude-3-5-sonnet-20240620` → `claude-sonnet-4-5` in `callAnthropicCompletion()`.
The `streamAnthropicMessages()` function receives the model from the caller (config.ts), so no change needed there.

### Task 1.2 — Real embeddings (Vercel env var) ✅
Set `EMBEDDING_PROVIDER_API_KEY` to a real OpenAI key in Vercel env vars.
After setting, re-ingest all documents from the admin panel to regenerate vectors with real embeddings.
**Note:** The code already correctly uses mock embeddings when the key is dummy (fixed in earlier session).

### Task 1.3 — Similarity thresholds raised ✅
**File:** `ai-backend/src/rag/retriever.ts`

```typescript
// BEFORE (mock-calibrated)
const KB_SIMILARITY_THRESHOLD = 0.60;
const CHUNK_SIMILARITY_THRESHOLD = 0.50;

// AFTER (real OpenAI text-embedding-3-large calibration)
const KB_SIMILARITY_THRESHOLD = 0.75;
const CHUNK_SIMILARITY_THRESHOLD = 0.65;
```

---

## ✅ Phase 2: Data Accuracy & Token Scoping

### Task 2.1 — MaskedVehicleDetails wired ✅
**File:** `ai-backend/src/integrations/tashus-adapter/endpoints.ts`

Verified: `getVehicleDetails()` already calls `vehicleFilterEngine.maskVehicleDetails(raw)`.
Returns `MaskedVehicleDetails` (~500 tokens) instead of raw `TCarDataState` (~5,000 tokens).
No code change needed — already correctly implemented.

### Task 2.2 — Dynamic schema router ✅
**File:** `ai-backend/src/agent/tools.ts`

Added `getToolsForIntent(userText: string): ToolSchema[]`:
- **Pure policy query** (cancel, smoke, damage, terms, etc.) → routes to `[search_knowledge_base, validate_voucher, escalate_to_human]` — 3 tools instead of 6
- **Pure vehicle search** (SUV, sedan, Sydney, available, etc.) → routes to `[search_vehicles, get_vehicle_details, check_availability, validate_voucher, escalate_to_human]` — 5 tools instead of 6
- **Mixed / ambiguous** → all 6 tools (safe default)

**File:** `ai-backend/src/agent/orchestrator.ts`

Orchestrator now uses `intentFilteredTools` instead of `AGENT_TOOLS` in the LLM loop.

**Token savings:** ~300 tokens/turn for scoped queries (removes irrelevant tool schemas from prompt).

### Task 2.3 — RAG dedup pointer ✅
**File:** `ai-backend/src/rag/dedup-cache.ts`

Verified: `checkDuplicate()` already returns a short pointer string (system message + 300-char preview) on cache HIT — NOT the full 2,000-token context block. No code change needed.

---

## ✅ Phase 3: Short-Circuit Formatting

### Task 3.1 — Fuzzy vehicle resolution ✅
**File:** `ai-backend/src/agent/orchestrator.ts`

Added before the LLM loop: scans `conversation.recentMessages` for `[VEHICLE:...]` tags, extracts `listingId` + `displayName` from prior search results. If user says something containing a vehicle name word AND a detail-intent keyword (`detail`, `about`, `feature`, `bluetooth`, etc.), injects `[Resolved vehicle: listingId=X, "Name"]` into the user message context.

This prevents the LLM from asking "which vehicle do you mean?" when the answer is obvious from context.

### Task 3.2 — check_availability template ✅
**File:** `ai-backend/src/agent/orchestrator.ts`

Added post-loop template block: when `check_availability` was the only tool called (no vehicle search in the same turn) and no LLM text was generated, formats the availability result directly in code:
- **Has blocked dates** → lists up to 5 periods + offers to search alternatives
- **No blocked dates** → clean "appears to be available" message

Eliminates the second LLM formatting round for availability queries.

---

## ✅ Phase 4: Vercel Latency & Connection Optimization

### Task 4.1 — maxDuration exports ✅
All streaming routes now export `maxDuration`:
- `chat/stream/route.ts` → 300s
- `session/[id]/stream/route.ts` → 300s  
- `admin/notifications/stream/route.ts` → 300s
- `test/stream/route.ts` → 300s
- `ingest/route.ts` → 120s

### Task 4.2 — Redis globalThis singleton ✅
**File:** `ai-backend/src/lib/redis.ts`

Both main client and subscriber pinned to `globalThis._tashusRedis` / `globalThis._tashusRedisSubscriber`. Persists TCP connection across warm Vercel invocations.

### Task 4.3 — Supabase keepAlive ✅
**File:** `ai-backend/src/db/client.ts`

Added `global.fetch` with `keepalive: true` to reuse HTTP/2 connection across DB calls in the same warm invocation.

---

## ✅ Phase 5: Graceful Rate Limit Handoff

### Task 5.1 — LLM_EXHAUSTED error ✅
**File:** `ai-backend/src/agent/llm.ts`

`generateCompletionStream()` catch block now throws `{ code: 'LLM_EXHAUSTED' }` instead of calling `generateToolAwareMock`. Mock is preserved for pure dev mode (no real keys).

### Task 5.2 — Orchestrator catch ✅
**File:** `ai-backend/src/agent/orchestrator.ts`

LLM loop wrapped in `try/catch`. `LLM_EXHAUSTED` code triggers:
1. DB update: `is_ai_paused=true`, `status='handed_off'`, `metadata.handoff_reason='rate_limit_exhausted'`
2. System message inserted to chat
3. Redis publish to widget control channel + admin notifications
4. `paused` + `done` events yielded to close SSE stream

### Task 5.3 — Admin panel ⚠️ badge ✅
**File:** `ai-admin/src/app/(admin)/sessions/page.tsx`

`SessionCard` renders ⚠️ icon when `session.metadata?.handoff_reason === 'rate_limit_exhausted'`.

---

## Files Changed (All Phases)

| File | Phases | Change |
|---|---|---|
| `ai-backend/src/agent/anthropic.ts` | 1.1 | Model → `claude-sonnet-4-5` |
| `ai-backend/src/rag/retriever.ts` | 1.3 | Thresholds: KB 0.60→0.75, chunks 0.50→0.65 |
| `ai-backend/src/agent/tools.ts` | 2.2 | Added `getToolsForIntent()` |
| `ai-backend/src/agent/orchestrator.ts` | 2.2, 3.1, 3.2, 5.2 | Intent router, fuzzy resolve, avail template, LLM_EXHAUSTED catch |
| `ai-backend/src/agent/llm.ts` | 5.1 | Throw `LLM_EXHAUSTED` instead of mock |
| `ai-backend/src/lib/redis.ts` | 4.2 | globalThis singleton |
| `ai-backend/src/db/client.ts` | 4.3 | Supabase keepAlive |
| `ai-backend/src/app/api/ai/chat/stream/route.ts` | 4.1 | `maxDuration = 300` |
| `ai-backend/src/app/api/ai/ingest/route.ts` | 4.1 | `maxDuration = 120` |
| `ai-backend/src/app/api/ai/session/[id]/stream/route.ts` | 4.1 | `maxDuration = 300` |
| `ai-backend/src/app/api/admin/notifications/stream/route.ts` | 4.1 | `maxDuration = 300` |
| `ai-backend/src/app/api/ai/test/stream/route.ts` | 4.1 | `maxDuration = 300` |
| `ai-admin/src/app/(admin)/sessions/page.tsx` | 5.3 | ⚠️ rate limit badge |

---

## Verified Already Correct (No Change Needed)

| Task | File | Finding |
|---|---|---|
| 2.1 MaskedVehicleDetails wiring | `endpoints.ts` | `maskVehicleDetails()` already called in `getVehicleDetails()` |
| 2.3 Dedup pointer | `dedup-cache.ts` | `checkDuplicate()` already returns system pointer + 300-char preview |
| 1.2 Embedding mock in prod | `embedding-provider.ts` | Already fixed in earlier session — dummy key → mock in all environments |

---

## Expected Impact Summary

| Optimization | Metric | Expected Improvement |
|---|---|---|
| Phase 1.3 — Thresholds | RAG quality | Fewer false-positive KB matches |
| Phase 2.2 — Tool router | Token cost | ~300 tokens/turn for scoped queries |
| Phase 3.1 — Fuzzy resolve | UX | No "which vehicle?" clarification questions |
| Phase 3.2 — Avail template | Latency + cost | -800ms, -1 LLM round for availability queries |
| Phase 4.1 — maxDuration | Reliability | No 504 timeouts on long Groq streams |
| Phase 4.2 — Redis singleton | Latency | -200-400ms on warm invocations |
| Phase 4.3 — keepAlive | Latency | -50-150ms per DB call on warm invocations |
| Phase 5 — LLM handoff | UX | No mock garbage when providers exhausted |

---

*All 5 phases complete. Committed to main branch: `a9f661d`*
*Last updated: 2026-08-04*
