# Tashus AI Agent — Optimization Implementation Plan
# Phases 1–5

> **Version:** 1.0
> **Created:** 2026-08-03
> **Based on:** Current codebase audit (see ground truth notes per phase)
> **Primary LLM:** llama-3.3-70b-versatile via Groq — NOT migrated in this plan

---

## Ground Rules

1. **Do not migrate the primary LLM.** Groq `llama-3.3-70b-versatile` remains primary.
2. **Verify against code, not docs.** Every task below references the exact current file state.
3. **Do not remove UI fields.** `coverPhotoUrl`, `seats`, `transmission` must stay in all masked types.
4. **Phases are sequential.** Complete acceptance gate before starting next phase.

---

## Phase 1: Restore Fallback Reliability & RAG Thresholds

**Objective:** Fix the Anthropic fallback model string (outdated model name causes silent failures)
and raise similarity thresholds now that real embeddings are available.

### Current State (audited)

- `ai-backend/src/agent/llm.ts` line ~374:
  `streamAnthropicMessages({ model: model || 'claude-3-5-sonnet-20240620', ... })`
  The model string `claude-3-5-sonnet-20240620` is the old model ID.

- `ai-backend/src/rag/retriever.ts` lines 24-25:
  ```
  const KB_SIMILARITY_THRESHOLD = 0.60;
  const CHUNK_SIMILARITY_THRESHOLD = 0.50;
  ```
  These were calibrated for mock embeddings. Real OpenAI vectors have stronger
  signal — thresholds should be raised to reduce noisy matches.

- `ai-backend/src/rag/embedding-provider.ts`:
  `isDummyKey` check now correctly activates mock in production too (already fixed).
  Real embeddings require setting a valid `EMBEDDING_PROVIDER_API_KEY` in Vercel.

### Tasks

#### Task 1.1 — Update Anthropic Fallback Model

**File:** `ai-backend/src/agent/llm.ts`

Find the `streamAnthropic` function (approximately line 370). Change:
```typescript
// BEFORE
model: model || 'claude-3-5-sonnet-20240620',

// AFTER
model: model || 'claude-sonnet-4-5',
```

Also update the legacy `callAnthropicCompletion` path in `anthropic.ts` if it also
hardcodes the model string — search for `claude-3-5-sonnet` across the codebase.

#### Task 1.2 — Configure Real Embeddings in Vercel

**Action (not a code change):**

In Vercel → tashus-ai-ten → Settings → Environment Variables:
- Set `EMBEDDING_PROVIDER_API_KEY` to a real OpenAI key (`sk-...`)
- Redeploy

After deploy, re-ingest all documents from the admin panel (Documents → Re-Ingest)
so existing chunks get real vector embeddings.

**Why:** Mock embeddings use a deterministic hash function. Chunks stored with mock
vectors will never match queries embedded with real OpenAI vectors. Both sides
must use the same embedding model.

#### Task 1.3 — Recalibrate Similarity Thresholds

**File:** `ai-backend/src/rag/retriever.ts`

After re-ingesting documents with real embeddings, update thresholds:
```typescript
// BEFORE (mock-calibrated)
const KB_SIMILARITY_THRESHOLD = 0.60;
const CHUNK_SIMILARITY_THRESHOLD = 0.50;

// AFTER (real OpenAI text-embedding-3-large calibration)
const KB_SIMILARITY_THRESHOLD = 0.75;
const CHUNK_SIMILARITY_THRESHOLD = 0.65;
```

**Rationale:** OpenAI `text-embedding-3-large` produces tighter clusters than mock
hash-based vectors. A threshold of 0.75 filters noise while still catching semantic
synonyms. Verify empirically by testing KB queries with synonym variations after deploy.

### Acceptance Gate

- [ ] Force Groq failure by temporarily setting `GROK_API_KEYS=invalid` in local `.env.local`.
      Widget should receive a streamed response from Anthropic `claude-sonnet-4-5`.
      Check server logs for `[FallbackChain] ✅  anthropic succeeded`.
- [ ] With real embeddings active, query "Can I vape in the rental?" — should return
      the smoking policy entry (synonym match) with similarity > 0.75.
- [ ] Logs confirm `[EmbeddingProvider]` is NOT using mock in production.

---

## Phase 2: Data Accuracy & Token Scoping

**Objective:** Expose richer vehicle detail data to the LLM to prevent hallucination,
and reduce prompt size by only sending relevant tool schemas.

### Current State (audited)

- `ai-backend/src/integrations/tashus-adapter/filter-engine.ts`:
  `MaskedVehicleDetails` interface already EXISTS in the file (lines ~75-100).
  It already has `topFeatures`, `description`, `guidelines` fields.
  **Verify** that `maskVehicleDetails()` is actually called in `endpoints.ts`
  for `getVehicleDetails` — if not, wire it in.

- `ai-backend/src/agent/tools.ts`:
  All 6 tool schemas are always sent on every non-final round (line ~280 in orchestrator).
  No dynamic filtering exists yet.

- `ai-backend/src/rag/dedup-cache.ts`:
  `checkDuplicate()` currently returns the FULL cached context string (2,000 tokens).
  The orchestrator uses this as the `result` for `search_knowledge_base` tool calls.

### Tasks

#### Task 2.1 — Verify and Wire MaskedVehicleDetails

**File:** `ai-backend/src/integrations/tashus-adapter/endpoints.ts`

Read `getVehicleDetails()`. Confirm it calls `maskVehicleDetails(raw)` and returns
the masked type. If it returns the raw `TCarDataState` directly, replace:
```typescript
// BEFORE (hypothetical if not masked)
return raw;

// AFTER
import { maskVehicleDetails } from './filter-engine';
return maskVehicleDetails(raw);
```

Ensure `MaskedVehicleDetails` includes these fields critical for common user questions:
```typescript
export interface MaskedVehicleDetails {
  listingId: number;
  displayName: string;
  carType: string;
  specs: { year, seats, doors, transmission, fuelType, odometer };
  rates: { daily, hourly, peakSurcharge?, weeklyDiscount? };
  topFeatures: string[];       // Max 7 — includes Bluetooth, child seat, etc.
  description: string;         // HTML-stripped, max 300 chars
  guidelines: string;          // Host rules (smoking, pets, fuel, etc.)
  travelRestrictions: string;  // Interstate, island restrictions
  location: { city, state, parkingInstructions };
  hostInfo: { firstName, rating, tripCount };
  coverPhotoUrl: string;       // Required for VehicleResultCard
}
```

#### Task 2.2 — Dynamic Schema Router

**File:** `ai-backend/src/agent/tools.ts`

Add a `getToolsForIntent()` function that filters the schema array based on
the user message. Call this from the orchestrator instead of always passing
`AGENT_TOOLS`.

```typescript
export function getToolsForIntent(userText: string): ToolSchema[] {
  const t = userText.toLowerCase();

  // Pure vehicle search intent — skip KB and escalation schemas
  const isVehicleSearch = /\b(suv|sedan|car|vehicle|rent|book|available|find)\b/.test(t)
    && !/\b(policy|rule|cancel|smoke|damage|fee|human|agent)\b/.test(t);

  // Pure policy/FAQ intent — skip vehicle search schemas
  const isPolicyQuery = /\b(policy|rule|cancel|smoke|damage|fee|age|limit|insurance)\b/.test(t)
    && !/\b(suv|sedan|car|vehicle|rent|book)\b/.test(t);

  if (isVehicleSearch) {
    // Omit search_knowledge_base — not needed for pure search
    return AGENT_TOOLS.filter(t =>
      ['search_vehicles', 'get_vehicle_details', 'check_availability',
       'validate_voucher', 'escalate_to_human'].includes(t.name)
    );
  }

  if (isPolicyQuery) {
    // Omit search_vehicles and check_availability — not needed for policy queries
    return AGENT_TOOLS.filter(t =>
      ['search_knowledge_base', 'escalate_to_human'].includes(t.name)
    );
  }

  // Default: all tools
  return AGENT_TOOLS;
}
```

**Update orchestrator** (`orchestrator.ts`):
```typescript
// BEFORE
const toolsToUse = round === maxRounds - 1 ? [] : AGENT_TOOLS;

// AFTER
import { getToolsForIntent } from '@/agent/tools';
const toolsForThisConversation = getToolsForIntent(userText);
const toolsToUse = round === maxRounds - 1 ? [] : toolsForThisConversation;
```

**Token savings:** Removing 2 tool schemas saves ~300 tokens per turn on scoped queries.

#### Task 2.3 — RAG Dedup Pointer Return

**File:** `ai-backend/src/rag/dedup-cache.ts`

Find `checkDuplicate()`. Currently returns the full context string. Change to return
a short pointer string instead:

```typescript
// BEFORE
return entry.context; // Full 2,000-token context block

// AFTER — return pointer so LLM knows context is already in prompt
// The orchestrator's dynamic context already contains the full RAG text.
// Returning the full block again doubles the token cost for no benefit.
return `[System: Relevant policy context has already been injected into your
context window at the top of this conversation. Do not re-retrieve —
use the context already provided to answer the question.]`;
```

**Token savings:** Cuts ~2,000 tokens from every turn where both proactive RAG
and `search_knowledge_base` tool fire on the same query topic.

### Acceptance Gate

- [ ] Query "Can I bring my dog in this specific car?" with a listing ID in context.
      AI should answer using `guidelines` field from `MaskedVehicleDetails`.
      Server logs show `get_vehicle_details` result contains `guidelines` field.
- [ ] For "I need an SUV", server logs confirm tool schemas array has 5 tools,
      NOT 6 (search_knowledge_base excluded).
- [ ] For "what is the cancellation policy?", logs confirm array has 2 tools.
- [ ] A redundant RAG turn shows `tokens_in` drop of ~2,000 vs baseline in logs.

---

## Phase 3: Short-Circuit Formatting

**Objective:** Eliminate the second LLM round for deterministic data tools by
injecting vehicle card output directly in code rather than asking the LLM to format it.

### Current State (audited)

The orchestrator already short-circuits vehicle card formatting for `search_vehicles`
(added in an earlier optimization). The post-processing block after the loop injects
`[VEHICLE:...]` tags and streams them directly.

However `get_vehicle_details` and `check_availability` still trigger a second LLM
round to format their results. This adds ~$0.00003/turn and ~800ms latency.

### Tasks

#### Task 3.1 — Fuzzy Vehicle Resolution from Conversation Context

**File:** `ai-backend/src/agent/orchestrator.ts`

Before calling the LLM on a detail/follow-up query, check if the user is referring
to a vehicle already shown in the session. Add after the `handoffPattern` check:

```typescript
// ── Fuzzy vehicle resolution (Phase 3.1) ───────────────────────────────────
// If user says "tell me about the Toyota" and we showed a Toyota in a previous
// search result this session, resolve the listingId without an LLM turn.
if (dbSessionId) {
  const recentToolResults = conversation.recentMessages
    .filter(m => m.role === 'assistant')
    .map(m => {
      // Extract [VEHICLE:...] tags from assistant messages
      const matches = [...m.content.matchAll(/\[VEHICLE:\s*(\{[^}]+\})/g)];
      return matches.map(match => { try { return JSON.parse(match[1]); } catch { return null; }})
                    .filter(Boolean);
    }).flat();

  if (recentToolResults.length > 0) {
    const lowerText = userText.toLowerCase();
    const fuzzyMatch = recentToolResults.find(v => {
      const name = (v.displayName || '').toLowerCase();
      // Check if any word in the vehicle name appears in the user query
      return name.split(' ').some(word => word.length > 3 && lowerText.includes(word));
    });

    if (fuzzyMatch && /\b(detail|more|about|tell|info|feature|spec|book|available)\b/i.test(userText)) {
      console.log(`[Orchestrator] 🎯 Fuzzy vehicle resolution: "${fuzzyMatch.displayName}" (${fuzzyMatch.listingId})`);
      // Inject resolved listingId into user message for LLM context
      // This prevents the LLM from needing to ask which vehicle
      loopMessages[loopMessages.length - 1].content =
        `${userText} [Resolved vehicle: listingId=${fuzzyMatch.listingId}, "${fuzzyMatch.displayName}"]`;
    }
  }
}
```

#### Task 3.2 — Template Formatting for check_availability

**File:** `ai-backend/src/agent/orchestrator.ts`

After the tool result for `check_availability` is returned, detect it in the
post-loop block and format it directly without an LLM round:

```typescript
// After the main loop, before vehicle card injection:
const availabilityCall = toolCalls.find(t => t.name === 'check_availability' && t.result);
if (availabilityCall && !toolCalls.find(t => t.name === 'search_vehicles')) {
  const blockDates = availabilityCall.result;
  const hasBlocks = blockDates?.allDayList?.length > 0 || blockDates?.customList?.length > 0;

  const formattedAvailability = hasBlocks
    ? `This vehicle has some blocked dates. Here are the unavailable periods:\n\n` +
      [...(blockDates.allDayList || []), ...(blockDates.customList || [])]
        .slice(0, 5)
        .map(d => `• ${new Date(d.start).toLocaleDateString('en-AU')} – ${new Date(d.end).toLocaleDateString('en-AU')}`)
        .join('\n') +
      `\n\nFor dates outside these periods, the vehicle should be available. Want me to search for available vehicles on specific dates?`
    : `Great news! This vehicle has no blocked dates in our system — it appears to be available. I'd recommend confirming directly on the Tashus listing page before booking.`;

  // Only use template if finalMessageText is empty (LLM didn't already respond)
  if (!finalMessageText.trim()) {
    finalMessageText = formattedAvailability;
    yield { type: 'token' as const, text: formattedAvailability };
  }
}
```

### Acceptance Gate

- [ ] In `ai_tool_call_logs`, a `check_availability` query shows only 1 LLM round
      recorded in `__turn_summary__` (1 round = tool call round, 0 formatting rounds).
- [ ] "Tell me about the Toyota" after a search showing a Toyota resolves the listingId
      without the LLM asking "Which Toyota do you mean?".
- [ ] `ai_tool_call_logs` `tokens_out` for check_availability turns drops by ~50%.

---

## Phase 4: Vercel Latency & Connection Optimization

**Objective:** Reduce cold-start latency and prevent streaming timeouts.

### Current State (audited)

- `stream/route.ts` has `export const dynamic = 'force-dynamic'` but no explicit
  `export const maxDuration`. Vercel Hobby defaults to 10s which will kill long streams.
  Fluid Compute is enabled but `maxDuration` must still be declared in code.

- `redis.ts`: Client is a singleton (`let _redis`) initialized outside handlers ✅.
  Uses `ioredis` with `lazyConnect: true` in serverless mode ✅. Already optimal.

- `db/client.ts`: Uses Supabase JS client (`createClient`) which uses HTTP, not raw
  TCP postgres. No connection pooling needed — Supabase JS manages connections
  internally over HTTP/2. No change needed.

### Tasks

#### Task 4.1 — Declare maxDuration on Streaming Routes

**Files:** Add to each file that handles long-running SSE or inference:

`ai-backend/src/app/api/ai/chat/stream/route.ts`:
```typescript
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds — matches vercel.json
```

`ai-backend/src/app/api/ai/session/[id]/stream/route.ts`:
```typescript
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
```

`ai-backend/src/app/api/admin/notifications/stream/route.ts`:
```typescript
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
```

`ai-backend/src/app/api/ai/ingest/route.ts`:
```typescript
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
```

**Why:** Even with Fluid Compute enabled, Vercel requires the `maxDuration` export
to know the upper bound. Without it, the function silently reverts to the plan default.

#### Task 4.2 — Verify Redis Singleton Is Not Re-instantiated

**File:** `ai-backend/src/lib/redis.ts`

Confirm `let _redis: Redis | null = null` is at module level (not inside a function).
The current code is correct — `getRedisClient()` checks `if (_redis) return _redis`.

In serverless, Vercel reuses the same Node.js process for multiple invocations on
the same instance (warm starts). The singleton persists across warm invocations ✅.

**No code change needed** — just verify and document.

#### Task 4.3 — Add Supabase keepAlive Hint

**File:** `ai-backend/src/db/client.ts`

The Supabase JS client uses `fetch` under the hood. Add a global `keepAlive` agent
hint to reduce TCP handshake overhead on warm invocations:

```typescript
// Add to createClient options:
_client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: (url, options) => fetch(url, { ...options, keepalive: true }),
  },
});
```

### Acceptance Gate

- [ ] Verify Vercel function logs show no `504 Gateway Timeout` on a 30-second
      Groq response.
- [ ] Check Vercel function config in dashboard — duration shows 300s, not 10s.
- [ ] Cold start latency (first request after deploy) < 3s for a simple "hi" message.
- [ ] Warm start latency (2nd–5th sequential requests) < 1.5s for the same query.

---

## Phase 5: Graceful Rate Limit Handoff

**Objective:** Replace the tool-aware mock (last resort) with automatic human handoff
when all LLM providers are exhausted. Users get a clear message; admins are notified.

### Current State (audited)

`ai-backend/src/agent/llm.ts` — `generateCompletionStream()` end:
```typescript
} catch (err: any) {
  console.error('[LLM] ⚠️  All real providers exhausted:', err.message);
  console.warn('[LLM] ⚠️  Falling back to tool-aware mock');
  yield* generateToolAwareMock(params.messages, params.tools);  // ← REMOVE THIS
}
```

`ai-backend/src/agent/orchestrator.ts` — The existing `escalate_to_human` tool
handler already contains all the logic needed (DB update, system message, Redis publish).
We just need to call it on LLM exhaustion.

### Tasks

#### Task 5.1 — Replace Mock with Exhaustion Error

**File:** `ai-backend/src/agent/llm.ts`

Change the catch block in `generateCompletionStream()`:
```typescript
// BEFORE
} catch (err: any) {
  console.error('[LLM] ⚠️  All real providers exhausted:', err.message);
  console.warn('[LLM] ⚠️  Falling back to tool-aware mock');
  yield* generateToolAwareMock(params.messages, params.tools);
}

// AFTER
} catch (err: any) {
  console.error('[LLM] ⚠️  All real providers exhausted:', err.message);
  // Throw a typed error so the orchestrator can trigger human handoff
  throw Object.assign(
    new Error('All LLM providers exhausted'),
    { code: 'LLM_EXHAUSTED', cause: err?.message }
  );
}
```

**Note:** Do NOT remove `generateToolAwareMock` yet — it is also called for
`isGrokMock && isAnthropicMock` (pure dev mode with no real keys). Only the
catch block changes.

#### Task 5.2 — Catch Exhaustion in Orchestrator and Trigger Handoff

**File:** `ai-backend/src/agent/orchestrator.ts`

Wrap the LLM loop with a specific catch for the `LLM_EXHAUSTED` code:

```typescript
// In processMessageStream(), wrap the for loop:
try {
  // ... existing maxRounds loop ...
} catch (llmErr: any) {
  if (llmErr?.code === 'LLM_EXHAUSTED' && dbSessionId) {
    console.error(`[Orchestrator] 🚨 LLM exhausted — triggering auto-handoff for session ${sessionId}`);

    // Activate circuit breaker
    await (db.from('ai_chat_sessions') as any)
      .update({ is_ai_paused: true, status: 'handed_off', last_message_at: new Date().toISOString() })
      .eq('id', dbSessionId);

    const systemMsg = '⚠️ AI support is temporarily paused due to high demand. Connecting you to a human agent — please hold on a moment.';
    await (db.from('ai_chat_messages') as any)
      .insert({ session_id: dbSessionId, role: 'system', content: systemMsg });

    // Notify widget via poll
    try {
      const { redis: redisClient, buildSessionControlChannel } = await import('@/lib/redis');
      const { data: sessionState } = await (db.from('ai_chat_sessions') as any)
        .select('visitor_id').eq('id', dbSessionId).single();

      await redisClient.publish(buildSessionControlChannel(dbSessionId), JSON.stringify({
        type: 'control',
        paused: true,
        message: { role: 'system', content: systemMsg },
      }));

      // Notify all admin dashboards with rate_limit reason
      await redisClient.publish('admin:notifications', JSON.stringify({
        type: 'handoff_requested',
        session_id: dbSessionId,
        visitor_id: sessionState?.visitor_id,
        reason: 'rate_limit_exhausted',
        timestamp: new Date().toISOString(),
      }));
    } catch (redisErr) {
      console.warn('[Orchestrator] Redis publish failed during LLM exhaustion handoff:', redisErr);
    }

    // Stream the system message to the widget
    yield { type: 'paused' as const, message: { role: 'system', content: systemMsg } };
    yield { type: 'done' as const, message: systemMsg, sources: [] };
    return;
  }

  // Re-throw non-LLM-exhaustion errors
  throw llmErr;
}
```

#### Task 5.3 — Admin Panel Rate Limit Badge

**File:** `ai-admin/src/app/(admin)/sessions/page.tsx`

The admin SSE already listens for `handoff_requested` events. Add a visual distinction
for `reason: 'rate_limit_exhausted'` in the `SessionCard` component:

```typescript
// In SessionCard, add rate_limit indicator:
const isRateLimitHandoff = session.metadata?.handoff_reason === 'rate_limit_exhausted';

// In the avatar area:
{isHandoff && isRateLimitHandoff && (
  <span title="Handoff due to AI rate limit" className="absolute -top-1 -right-1 text-[9px]">⚠️</span>
)}
```

**Note:** This requires the handoff reason to be stored in `ai_chat_sessions.metadata`.
Add to the DB update in Task 5.2:
```typescript
.update({
  is_ai_paused: true,
  status: 'handed_off',
  last_message_at: new Date().toISOString(),
  metadata: db.rpc ? undefined : { handoff_reason: 'rate_limit_exhausted' }, // store reason
})
```

Use Supabase's `jsonb_set` or just overwrite the metadata object:
```typescript
// Fetch existing metadata first, then merge:
const { data: existing } = await (db.from('ai_chat_sessions') as any)
  .select('metadata').eq('id', dbSessionId).single();

await (db.from('ai_chat_sessions') as any)
  .update({
    is_ai_paused: true,
    status: 'handed_off',
    last_message_at: new Date().toISOString(),
    metadata: { ...(existing?.metadata || {}), handoff_reason: 'rate_limit_exhausted' },
  })
  .eq('id', dbSessionId);
```

### Acceptance Gate

- [ ] In local dev, set `GROK_API_KEYS=invalid` and `ANTHROPIC_API_KEY=invalid`.
      Send a message to the widget.
      Widget must display: "⚠️ AI support is temporarily paused..." (NOT mock vehicle cards).
- [ ] `ai_chat_sessions` record for that session has `is_ai_paused=true` and
      `metadata.handoff_reason='rate_limit_exhausted'`.
- [ ] Admin panel session list shows the session in the Handoff tab with ⚠️ icon.
- [ ] Server logs confirm: `[Orchestrator] 🚨 LLM exhausted — triggering auto-handoff`.
- [ ] No mock vehicle cards or KB text dumps appear in the widget for this session.

---

## Implementation Order Summary

| Phase | Priority | Token Impact | UX Impact | Effort |
|---|---|---|---|---|
| Phase 1 | 🔴 Critical | Medium | High (better KB answers) | Low |
| Phase 5 | 🔴 Critical | None | High (no more mock dumps) | Medium |
| Phase 2 | 🟠 High | -30% per turn | High (accurate vehicle info) | Medium |
| Phase 3 | 🟡 Medium | -40% for data tools | Medium (faster responses) | Medium |
| Phase 4 | 🟡 Medium | None | Medium (lower latency) | Low |

**Recommended execution order:** 1 → 5 → 2 → 4 → 3

Phases 1 and 5 are high-value fixes with low risk. Phase 2 builds on Phase 1
(needs real embeddings first). Phase 4 is low effort and independent. Phase 3
is the most complex (fuzzy matching, template formatting) and should be last.

---

## File Change Summary

| File | Phases | Type of Change |
|---|---|---|
| `ai-backend/src/agent/llm.ts` | 1, 5 | Model string update; remove mock fallback |
| `ai-backend/src/rag/retriever.ts` | 1 | Threshold constants update |
| `ai-backend/src/rag/dedup-cache.ts` | 2 | Return pointer string not full context |
| `ai-backend/src/integrations/tashus-adapter/filter-engine.ts` | 2 | Verify/complete MaskedVehicleDetails |
| `ai-backend/src/integrations/tashus-adapter/endpoints.ts` | 2 | Wire maskVehicleDetails() |
| `ai-backend/src/agent/tools.ts` | 2 | Add getToolsForIntent() |
| `ai-backend/src/agent/orchestrator.ts` | 2, 3, 5 | Schema router; fuzzy resolve; exhaustion handoff |
| `ai-backend/src/app/api/ai/chat/stream/route.ts` | 4 | Add maxDuration export |
| `ai-backend/src/app/api/ai/session/[id]/stream/route.ts` | 4 | Add maxDuration export |
| `ai-backend/src/app/api/admin/notifications/stream/route.ts` | 4 | Add maxDuration export |
| `ai-backend/src/app/api/ai/ingest/route.ts` | 4 | Add maxDuration export |
| `ai-backend/src/db/client.ts` | 4 | Add keepalive hint to fetch |
| `ai-admin/src/app/(admin)/sessions/page.tsx` | 5 | Rate limit badge in SessionCard |

---

*Plan created: 2026-08-03 | Author: Kiro | Based on live codebase audit*
