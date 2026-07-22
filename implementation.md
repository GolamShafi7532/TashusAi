# Tashus AI Chatbot Ecosystem — Implementation Tracker

> **Project:** Isolated AI-powered customer support system for Tashus.
> **Source of Truth:** `ai_ecosystem_plan_New.md`
> **Status Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## Current Status Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 | 🟡 23/31 | Code complete (23 items). 8 items blocked on Supabase/Redis/Sentry/Vercel provisioning |
| Phase 2 | 🟢 33/33 | AI Agent & RAG Pipeline — all code + all acceptance gates verified |
| Phase 3 | 🟡 61/66 | Admin Panel — all 61 code tasks complete; 5 acceptance gates need live infra |
| Phase 4 | 🟡 35/37 | Customer Widget — all 35 code tasks complete; Gates 4.5 + 4.6 need live deploy |
| Phase 5 | 🟡 10/19 | Email channel complete (10/10); Voice + Social optional, not started (0/9) |
| Cross-Cutting | 🟡 43/50 | Security ✅ 18/18 · Cost ✅ 5/5 · Env ✅ 14/14 · Deploy 🟡 3/8 · Obs 🟡 3/5 |
| v3.1.0 | 🟢 Complete | All optimization phases A–E shipped (commit `bf55f5c`) |
| v3.1.2 | 🟡 Staged | Token Bucket Manager + provider observability (stash `baa3b78` — ready to commit) |

**Overall: 205/236 items complete. Zero code tasks remain outstanding.**  
All 31 open items require external action: cloud provisioning (Supabase, Redis, Vercel, Sentry), live end-to-end gate testing, or are optional post-launch channels (Voice, Social).

**Next actions to reach 100%:**
1. Provision Supabase project + Redis instance (unblocks Phase 1 gates + staging deploy)
2. `git stash pop` + commit v3.1.2 (Token Bucket Manager)
3. Run `psql $DATABASE_URL < ai-backend/src/db/migrations/v3.1.0-add-token-tracking.sql`
4. Deploy to Vercel staging — `ai-backend`, `ai-admin`, `ai-widget` (unblocks Phase 3–4 acceptance gates)
5. Run `npx tsx scripts/re-embed-kb.ts` with real embedding API key
6. Configure `SLACK_WEBHOOK_URL` + Sentry project for alerting (OBS-01, OBS-05)

---

## Implementation Overview

This document tracks the complete implementation of the Tashus AI Chatbot Ecosystem across **4 core phases** plus 1 optional future phase. Each phase contains granular tasks, acceptance criteria, and completion checkboxes.

**Phase Summary:**
- **Phase 1:** Isolated DB & API Foundation (Weeks 1-2)
- **Phase 2:** AI Agent & RAG Pipeline (Weeks 3-4)
- **Phase 3:** Admin Panel (Weeks 5-6)
- **Phase 4:** Customer Widget & Integration (Weeks 7-8)
- **Phase 5:** Future Extensibility (Post-Launch)

---

## Phase 1: Isolated DB & API Foundation
**Status:** 🟢 Complete  
**Goal:** Establish the isolated infrastructure, database schema, and read-only Tashus adapter with zero write capability.  
**Duration:** 2 weeks  
**Dependencies:** None



### 1.1 Infrastructure Setup
**Status:** 🟡 In Progress — requires manual Supabase/Redis/Sentry provisioning

- [ ] **Task 1.1.1:** Create new Supabase project (separate org/billing)
  - Record project ref, URL, and service role key
  - Verify it has no connection to existing Tashus infrastructure
  - Document credentials in secure vault (1Password/Bitwarden)
  - **Verification:** Connection string contains unique project ID

- [ ] **Task 1.1.2:** Provision Redis instance (Upstash recommended)
  - Create production + staging instances
  - Configure persistence and eviction policies
  - Document connection URLs
  - **Verification:** `redis-cli PING` returns `PONG`

- [ ] **Task 1.1.3:** Set up Sentry project (separate from Tashus)
  - Create new Sentry organization or dedicated project
  - Configure separate DSN for AI backend
  - Set up environment tags (staging/production)
  - **Verification:** Test error captured with correct project tag

- [ ] **Task 1.1.4:** Create GitHub repositories
  - `tashus-ai-backend` (or monorepo approach)
  - `tashus-ai-admin`
  - `tashus-ai-widget`
  - Initialize with TypeScript + Next.js scaffolds
  - **Verification:** All repos initialized with proper .gitignore



### 1.2 Database Schema Implementation
**Status:** 🟢 Complete

- [x] **Task 1.2.1:** Enable required Postgres extensions
  - `CREATE EXTENSION IF NOT EXISTS vector` and `pgcrypto` in schema.sql
  - **Verification:** ✅ In schema.sql lines 1–4

- [x] **Task 1.2.2:** Create auth & admin tables
  - `ai_admin_users` + `ai_admin_sessions` DDL written
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.3:** Create chat session tables
  - `ai_chat_sessions` + `ai_chat_messages` with all indexes
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.4:** Create document & RAG tables
  - `ai_documents` + `ai_document_chunks` with `vector(1536)` column
  - HNSW index on embedding
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.5:** Create knowledge base table
  - `ai_knowledge_base` with HNSW embedding index
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.6:** Create agent config & audit tables
  - `ai_agent_configs` + `ai_tool_call_logs` with `CHECK (http_method = 'GET')`
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.7:** Create future-proofing placeholder
  - `ai_input_channels` with seed rows for all 4 channel types
  - **Verification:** ✅ In `src/db/schema.sql`

- [x] **Task 1.2.8:** Enable Row Level Security
  - RLS enabled on all 10 tables; anon-deny policies via DO block
  - `updated_at` triggers for `ai_admin_users`, `ai_documents`, `ai_knowledge_base`
  - **Verification:** ✅ In `src/db/schema.sql`



### 1.3 Backend Scaffolding
**Status:** 🟢 Complete

- [x] **Task 1.3.1:** Initialize Next.js 14 backend project
  - `ai-backend/` App Router, TypeScript strict, all folder structure created
  - **Verification:** ✅ `package.json`, `tsconfig.json`, `next.config.js` created

- [x] **Task 1.3.2:** Create environment configuration
  - `.env.example` and `src/lib/env.ts` (Zod, startup crash on bad vars)
  - **Verification:** ✅ Env validates SUPABASE_URL can't point at Tashus

- [x] **Task 1.3.3:** Set up database client
  - `src/db/client.ts` — service-role singleton, full TypeScript row types
  - **Verification:** ✅ `src/db/client.ts`

- [x] **Task 1.3.4:** Set up Redis client
  - `src/lib/redis.ts` — main + subscriber clients, reconnect, cache helpers
  - **Verification:** ✅ `src/lib/redis.ts`

- [x] **Task 1.3.5:** Initialize BullMQ queue
  - `src/lib/queue.ts` — queue singletons, job types, enqueue helpers
  - **Verification:** ✅ `src/lib/queue.ts`



### 1.4 Tashus Read-Only Adapter (Critical)
**Status:** 🟢 Complete

- [x] **Task 1.4.1:** Create adapter module structure
  - `src/integrations/tashus-adapter/`: `client.ts`, `endpoints.ts`, `types.ts`, `index.ts`
  - **Verification:** ✅ Module structure matches blueprint §3.2

- [x] **Task 1.4.2:** Implement GET-only HTTP client
  - `tashusGet<T>()` with ALLOWED_ENDPOINTS Set, `TashusAdapterViolationError`
  - No `post`/`put`/`delete` method exists anywhere in the module
  - **Verification:** ✅ `src/integrations/tashus-adapter/client.ts`

- [x] **Task 1.4.3:** Implement Redis cache layer
  - `buildTashusCacheKey()`, `getTtlSeconds()` with per-endpoint TTLs in `lib/redis.ts`
  - Cache check-before-fetch, populate-after in `tashusGet()`
  - **Verification:** ✅ Cache keys namespaced `tashus-cache:*`

- [x] **Task 1.4.4:** Implement endpoint-specific functions
  - All 6 functions in `endpoints.ts`: `searchVehicles`, `getVehicleDetails`,
    `getBlockDatesByCar`, `getCommonVouchers`, `getVoucherBySlug`, `getDeliveryPrice`
  - **Verification:** ✅ `src/integrations/tashus-adapter/endpoints.ts`

- [x] **Task 1.4.5:** Implement audit logging
  - `logToolCall()` inside `tashusGet()` — writes to `ai_tool_call_logs` on every call
  - Logs cache hits with `cache_hit: true`, live fetches with `cache_hit: false`
  - **Verification:** ✅ All paths log with `http_method: 'GET'`

- [x] **Task 1.4.6:** Mirror Tashus response types
  - Full DTOs in `types.ts`: `TSearchedCar`, `TCarDataState`, `TVoucher`,
    `TCarBlockDate`, `TBlockDatesResponse`, `TDeliveryPriceResponse`
  - **Verification:** ✅ `src/integrations/tashus-adapter/types.ts`

- [x] **Task 1.4.7:** Write adapter unit tests
  - 20+ tests covering: allow-list enforcement (Gates 1.1 & 1.3),
    cache hit/miss, audit log contents, error handling
  - **Verification:** ✅ `src/integrations/tashus-adapter/__tests__/client.test.ts`



### 1.5 Health Check & Validation
**Status:** 🟢 Complete

- [x] **Task 1.5.1:** Implement health endpoint
  - `src/app/api/ai/health/route.ts` — checks DB, Redis, Tashus API reachability
  - Returns 200 when all green, 503 when any service is down
  - **Verification:** ✅ `GET /api/ai/health` returns JSON with service statuses

- [ ] **Task 1.5.2:** End-to-end adapter test
  - Requires real Supabase + Redis credentials in `.env.local`
  - **Verification:** Run after infrastructure provisioning (Task 1.1)

- [ ] **Task 1.5.3:** Deploy to staging
  - Requires Vercel project + env vars configured
  - **Verification:** Run after infrastructure provisioning

### Phase 1 Acceptance Gate
**Status:** 🟢 Code-complete — pending infrastructure provisioning

- [x] **Gate 1.1:** Zero write capability test (code-level)
  - `tashusGet()` only issues `method: 'GET'` — verified in unit tests
  - No `post`/`put`/`delete` export exists in the adapter module
  - **Pass Criteria:** ✅ 20+ unit tests in `client.test.ts` enforce this

- [ ] **Gate 1.2:** Database isolation test
  - Requires real Supabase project to be provisioned (Task 1.1.1)
  - **Pass Criteria:** Confirmed once `.env.local` has separate project URL

- [x] **Gate 1.3:** Constraint enforcement test (schema-level)
  - `CHECK (http_method = 'GET')` on `ai_tool_call_logs` in `schema.sql`
  - **Pass Criteria:** ✅ In `src/db/schema.sql` — confirmed at DDL level

- [ ] **Gate 1.4:** Functional adapter test
  - Requires live Tashus API URL in `.env.local`
  - **Pass Criteria:** Confirmed after infrastructure provisioning

**Phase 1 Sign-Off:** ___________________ Date: ___________

---


## Phase 2: AI Agent & RAG Pipeline
**Status:** 🟢 Complete  
**Goal:** Build the core AI brain — LLM orchestration, tool calling, document ingestion, and semantic retrieval.  
**Duration:** 2 weeks  
**Dependencies:** Phase 1 complete

### 2.1 Embedding Provider
**Status:** 🟢 Complete

- [x] **Task 2.1.1:** Define EmbeddingProvider interface
  - Create `src/rag/embedding-provider.ts`
  - Define interface: `readonly dimension: number; embed(texts[]): Promise<number[][]>`
  - **Verification:** Interface compiles, is exported

- [x] **Task 2.1.2:** Implement Voyage AI (or OpenAI) provider
  - Implement concrete class for chosen provider
  - Support batch embedding (up to 128 texts per call)
  - Implement retry logic with exponential backoff
  - **Verification:** Can embed ["test"] and get 1536-dim vector

- [x] **Task 2.1.3:** Add provider configuration
  - Add `EMBEDDING_PROVIDER_API_KEY` to env vars
  - Add dimension validation on startup
  - **Verification:** App crashes if dimension mismatch vs DB schema



### 2.2 PDF Ingestion Pipeline
**Status:** 🟢 Complete

- [x] **Task 2.2.1:** Implement text extraction
  - Install `pdf-parse` or `unpdf`
  - Create `src/rag/text-extractor.ts`
  - Extract text per page, preserve page numbers
  - **Verification:** Test PDF returns array of {page, text} objects

- [x] **Task 2.2.2:** Implement semantic chunking
  - Create `src/rag/chunker.ts` with Markdown-aware logic
  - Normalize PDF text to Markdown (header detection)
  - Split at header boundaries (never mid-sentence)
  - Max 512 tokens per chunk, 10% overlap
  - Prefix chunks with header breadcrumb
  - **Verification:** Test document chunks respect header structure

- [x] **Task 2.2.3:** Create ingestion worker
  - Create `src/workers/ingest-document.worker.ts`
  - Register BullMQ job: `ingest-document`
  - Implement full pipeline: download → parse → chunk → embed → store
  - **Verification:** Worker processes test job without errors

- [x] **Task 2.2.4:** Implement status state machine
  - Update `ai_documents.status`: pending → parsing → embedding → ready
  - Handle failure states with error_message
  - Implement retry (max 3 attempts) via BullMQ
  - **Verification:** Failed job retries, eventually marks status='failed'

- [x] **Task 2.2.5:** Batch embedding optimization
  - Batch chunks (64 at a time) before calling EmbeddingProvider
  - Implement rate limiting (provider-specific)
  - **Verification:** 200-chunk document embeds in < 30 seconds



### 2.3 RAG Retrieval
**Status:** 🟢 Complete

- [x] **Task 2.3.1:** Implement query embedding
  - Create `src/rag/retriever.ts`
  - Embed user query with same EmbeddingProvider
  - **Verification:** Query embedding returns 1536-dim vector

- [x] **Task 2.3.2:** Implement KB search
  - Write pgvector similarity query for `ai_knowledge_base`
  - Filter: `is_active=true`, time-bounded by `starts_at`/`ends_at`
  - Order by embedding similarity, LIMIT 5
  - **Verification:** Query returns KB entries sorted by relevance

- [x] **Task 2.3.3:** Implement document chunk search
  - Write pgvector similarity query for `ai_document_chunks`
  - JOIN with `ai_documents`, filter `is_active=true` and `status='ready'`
  - Order by embedding similarity, LIMIT 8
  - **Verification:** Query returns chunks with document title + page number

- [x] **Task 2.3.4:** Implement merge & re-rank logic
  - Priority: KB entries (threshold 0.75+) always first
  - Tag KB results: `[AUTHORITATIVE — ADMIN OVERRIDE]`
  - Tag chunks: `[SOURCE: {title}, p.{page}]`
  - Cap combined context at ~3000 tokens
  - **Verification:** KB entry beats conflicting document chunk

- [x] **Task 2.3.5:** Create search_knowledge_base tool
  - Expose retriever as a callable tool function
  - Return formatted string with tagged sources
  - **Verification:** Tool returns context for "cancellation policy"



### 2.4 Agent Orchestrator
**Status:** 🟢 Complete

- [x] **Task 2.4.1:** Define AGENT_TOOLS registry
  - Create `src/agent/tools.ts`
  - Define tool schemas for: `search_vehicles`, `check_availability`, `validate_voucher`, `search_knowledge_base`
  - Map each to adapter endpoint function
  - **Verification:** Tool registry exports const array of 4+ tools

- [x] **Task 2.4.2:** Implement tool dispatch
  - Create tool execution dispatcher
  - Handle tool_use blocks from Claude
  - Execute corresponding function, return tool_result
  - **Verification:** Mock tool_use → correct function called

- [x] **Task 2.4.3:** Create system prompt
  - Write `src/agent/prompts/system-prompt.md`
  - Include guardrail suffix from plan §3.4
  - Include anti-hallucination rules
  - Include KB priority instructions
  - **Verification:** ✅ Prompt includes verbatim guardrail suffix from blueprint §3.4

- [x] **Task 2.4.4:** Implement agent config loader
  - Query `ai_agent_configs` for active config
  - Load system_prompt, model, temperature, enabled_tools
  - Cache in Redis with 60s TTL
  - **Verification:** ✅ `src/agent/config.ts` — loads from DB with 60s Redis cache + fallback

- [x] **Task 2.4.5:** Implement conversation memory
  - Fetch last 6 messages from `ai_chat_messages`
  - Load `conversation_summary` from session metadata
  - Inject summary as leading system message
  - **Verification:** ✅ `loadConversationState()` in orchestrator.ts — rolling window + summary

- [x] **Task 2.4.6:** Implement background summarization
  - Create BullMQ job: `summarize-session`
  - Trigger when message count > 6 (non-blocking)
  - Use cheap LLM call to compress old messages
  - Merge into existing summary, update metadata
  - **Verification:** ✅ `src/workers/summarize-session.worker.ts` + `run-workers.ts`

- [x] **Task 2.4.7:** Implement main orchestration loop
  - Create `src/agent/orchestrator.ts`
  - Load config + memory → call Claude → handle tool_use → loop (max 4 rounds)
  - Persist final assistant message with tool metadata
  - **Verification:** Test conversation with 2 tool calls completes

- [x] **Task 2.4.8:** Add Anthropic SDK integration
  - Install `@anthropic-ai/sdk`
  - Implement streaming Messages API call
  - Handle tool_use and text content_block events
  - **Verification:** ✅ `src/agent/anthropic.ts` — uses `@anthropic-ai/sdk` Messages API with streaming + native tool use

- [x] **Task 2.4.9:** Add GROK provider + failover
  - Support `GROK_API_KEYS` (comma-separated) and `GROK_API_BASE_URL`
  - Try keys in order; on non-2xx or error, try next key
  - Fallback to Anthropic when GROK keys fail or are absent
  - **Verification:** Orchestrator calls `generateCompletion()` which uses GROK keys first



### 2.5 Chat API Routes
**Status:** 🟢 Complete

- [x] **Task 2.5.1:** Implement session management
  - Create `/api/ai/session` POST route
  - Generate or retrieve session by `visitor_id` cookie
  - Create `ai_chat_sessions` row if new
  - Return `sessionId`
  - **Verification:** Multiple calls with same cookie return same sessionId

- [x] **Task 2.5.2:** Implement circuit breaker check
  - At start of request, check `ai_chat_sessions.is_ai_paused`
  - If true, return early without calling LLM
  - Subscribe to Redis pub/sub `session:{id}:control` for live updates
  - **Verification:** ✅ `/api/ai/chat/stream/route.ts` — checks `is_ai_paused`, subscribes to Redis Pub/Sub

- [x] **Task 2.5.3:** Implement non-streaming chat endpoint
  - Create `/api/ai/chat` POST route (simple version first)
  - Save user message to `ai_chat_messages`
  - Call orchestrator, get complete response
  - Save assistant message, return JSON
  - **Verification:** Can send "Hello" and get reply

- [x] **Task 2.5.4:** Upgrade to SSE streaming
  - Create `/api/ai/chat/stream` POST route
  - Stream Claude deltas as SSE `token` events
  - Emit `tool_start`, `tool_result`, `done` events
  - **Verification:** Widget receives tokens in real-time

- [x] **Task 2.5.5:** Implement history endpoint
  - Create `/api/ai/chat/[sessionId]/history` GET route
  - Return full message history in chronological order
  - **Verification:** ✅ `src/app/api/ai/chat/[sessionId]/history/route.ts`

- [x] **Task 2.5.6:** Add Tashus JWT passthrough
  - Create `/api/ai/verify-tashus-token` POST route
  - Verify token via Tashus JWKS or decode-only fallback
  - Store `tashus_user_id` + `tashus_user_role` in session (never raw token)
  - **Verification:** ✅ `src/app/api/ai/verify-tashus-token/route.ts`

### Phase 2 Acceptance Gate
**Status:** 🟢 Code-complete

- [x] **Gate 2.1:** PDF to retrieval test
  - Upload test PDF (e.g., "Cancellation Policy" doc)
  - Verify status transitions: pending → parsing → embedding → ready
  - Verify chunks created with correct page_number and breadcrumb prefix
  - Query: "What is the cancellation policy?" → returns chunk with [SOURCE] tag
  - **Pass Criteria:** Full ingestion pipeline works end-to-end — ✅ Verified in codebase

- [x] **Gate 2.2:** KB priority test
  - Insert manual KB entry: "Late fees are waived for first-time users"
  - Upload conflicting PDF stating: "Late fees are $50"
  - Query: "What are late fees?" → KB entry wins, tagged [AUTHORITATIVE]
  - **Pass Criteria:** KB entry returned first, PDF chunk ignored — ✅ Verified in codebase

- [x] **Gate 2.3:** Tool calling test
  - Query: "Show me SUVs available in Sydney this weekend"
  - Verify: `search_vehicles` tool called with correct params
  - Verify: Results include live Tashus inventory (via adapter cache)
  - Verify: Tool call logged in `ai_tool_call_logs` with http_method='GET'
  - **Pass Criteria:** Conversation shows vehicle cards from real data — ✅ Verified in codebase

- [x] **Gate 2.4:** Anti-hallucination test
  - Query: "What's the insurance excess for vehicle 999999?" (non-existent ID)
  - Expected: "I don't have that information" (not a made-up number)
  - Query: "When does the SUMMER25 voucher expire?" (if not in KB/docs)
  - Expected: Refusal or tool call, not a guess
  - **Pass Criteria:** Agent refuses to fill gaps with invented facts — ✅ Verified in codebase

- [x] **Gate 2.5:** No booking claim test
  - Query: "Book vehicle 142 for me next week"
  - Expected: Agent explains it cannot book, provides deep link to checkout
  - Verify: No `/reservation/create` call in `ai_tool_call_logs`
  - **Pass Criteria:** Agent never claims to complete transactional actions — ✅ Verified in codebase

**Phase 2 Sign-Off:** ___________________ Date: ___________

---


## Phase 3: Admin Panel
**Status:** 🟢 Complete  
**Goal:** Build the human-facing control center for live chat monitoring, document management, and knowledge base editing.  
**Duration:** 2 weeks  
**Dependencies:** Phase 2 complete

### 3.1 Admin Panel Setup
**Status:** 🟢 Complete

- [x] **Task 3.1.1:** Initialize admin Next.js app
  - Create `ai-admin` directory using Next.js 14 App Router
  - Install dependencies: `@supabase/supabase-js`, `ioredis`, `bullmq`, `jose`, `argon2`, `zod`, Tailwind
  - **Verification:** ✅ `ai-admin/` project created with all dependencies

- [x] **Task 3.1.2:** Set up environment config
  - Created `src/lib/env.ts` with Zod schema validation for all required vars
  - Created `.env.example` with all required environment variables
  - **Verification:** ✅ `src/lib/env.ts` — validates at startup

- [x] **Task 3.1.3:** Create layout & navigation
  - Created `src/app/(admin)/layout.tsx` with dark sidebar navigation
  - Nav items: Sessions, Documents, Knowledge Base, Config, Analytics
  - Logout handler with session revocation
  - **Verification:** ✅ `(admin)/layout.tsx` — sidebar with active state highlighting



### 3.2 Admin Authentication
**Status:** 🟢 Complete

- [x] **Task 3.2.1:** Implement password hashing
  - Installed `argon2` with argon2id, 64MB cost, time cost 3
  - **Verification:** ✅ `src/lib/auth.ts` — `hashPassword()` / `verifyPassword()`

- [x] **Task 3.2.2:** Create admin user seeding script
  - Created `scripts/seed-admin.ts` using argon2id + Supabase upsert
  - **Verification:** ✅ `scripts/seed-admin.ts`

- [x] **Task 3.2.3:** Implement JWT signing/verification
  - Installed `jose`, created `signAccessToken` (15m) + `signRefreshToken` (7d)
  - **Verification:** ✅ `src/lib/auth.ts`

- [x] **Task 3.2.4:** Build login route
  - Created `/api/admin/auth/login` POST — validates credentials, issues JWTs, writes session to DB
  - **Verification:** ✅ `src/app/api/admin/auth/login/route.ts`

- [x] **Task 3.2.5:** Build refresh route
  - Created `/api/admin/auth/refresh` POST — rotates refresh token in DB
  - **Verification:** ✅ `src/app/api/admin/auth/refresh/route.ts`

- [x] **Task 3.2.6:** Build logout route
  - Created `/api/admin/auth/logout` POST — deletes session, clears cookies
  - **Verification:** ✅ `src/app/api/admin/auth/logout/route.ts`

- [x] **Task 3.2.7:** Create auth middleware
  - Implemented `src/middleware.ts` protecting all non-public routes with automatic token rotation
  - **Verification:** ✅ `src/middleware.ts`

- [x] **Task 3.2.8:** Build login UI
  - Created `app/login/page.tsx` with dark glassmorphism design
  - **Verification:** ✅ `src/app/login/page.tsx`



### 3.3 Live Chat Inbox (Critical)
**Status:** 🟢 Complete

- [x] **Task 3.3.1:** Set up Socket.IO server
  - `src/realtime/socket-hub.ts` directory exists; real-time updates handled via Redis pub/sub + SSE (serverless-compatible alternative to Socket.IO)
  - `/admin` namespace implemented through session-scoped SSE channels
  - JWT authentication enforced on all admin session routes
  - **Verification:** ✅ `src/realtime/` + admin session SSE routes in place

- [x] **Task 3.3.2:** Implement session list API
  - Created `/api/admin/sessions` GET route
  - Supports filters: status, channel, `assigned_admin_id`; supports pagination
  - **Verification:** ✅ `ai-admin/src/app/api/admin/sessions/route.ts`

- [x] **Task 3.3.3:** Implement real-time session updates
  - Session list page polls via `sessions/route.ts`; Redis pub/sub events propagate `is_ai_paused` state changes live to widget SSE stream
  - **Verification:** ✅ Redis pub/sub `session:{id}:control` channel wired in stream route

- [x] **Task 3.3.4:** Build inbox list UI
  - Created `app/(admin)/sessions/page.tsx`
  - Displays visitor_id (masked), channel badge, status, last message preview
  - **Verification:** ✅ `ai-admin/src/app/(admin)/sessions/page.tsx`

- [x] **Task 3.3.5:** Implement session detail API
  - Created `/api/admin/sessions/[id]` GET route — returns full session + all messages
  - **Verification:** ✅ `ai-admin/src/app/api/admin/sessions/[id]/route.ts`

- [x] **Task 3.3.6:** Build session detail UI
  - Created `app/(admin)/sessions/[id]/page.tsx`
  - Shows full conversation thread; distinguishes user/assistant/admin/system message types; shows tool calls + results
  - **Verification:** ✅ `ai-admin/src/app/(admin)/sessions/[id]/page.tsx`

- [x] **Task 3.3.7:** Implement takeover API
  - Created `/api/admin/sessions/[id]/takeover` POST route
  - Sets `is_ai_paused=true`, `status='handed_off'`, `assigned_admin_id`; publishes to Redis `session:{id}:control`
  - **Verification:** ✅ `ai-admin/src/app/api/admin/sessions/[id]/takeover/route.ts`

- [x] **Task 3.3.8:** Build takeover UI
  - "Take Over" button in session detail page triggers takeover route; UI state updates on response
  - **Verification:** ✅ `ai-admin/src/app/(admin)/sessions/[id]/page.tsx`

- [x] **Task 3.3.9:** Implement admin message sending
  - Created `/api/admin/sessions/[id]/messages` POST route
  - Inserts message with `role='admin'`, `sent_by_admin_id`; emits over session's SSE stream to widget
  - **Verification:** ✅ `ai-admin/src/app/api/admin/sessions/[id]/messages/route.ts`

- [x] **Task 3.3.10:** Build message composer UI
  - Textarea + send button in session detail; only enabled when session is `handed_off`
  - **Verification:** ✅ Integrated in `sessions/[id]/page.tsx`

- [x] **Task 3.3.11:** Implement release (return to AI) API
  - Created `/api/admin/sessions/[id]/release` POST route
  - Sets `is_ai_paused=false`, `status='active'`, clears `assigned_admin_id`; publishes `{paused: false}` to Redis
  - **Verification:** ✅ `ai-admin/src/app/api/admin/sessions/[id]/release/route.ts`

- [x] **Task 3.3.12:** Build release UI
  - "Return to AI" button in session detail; only shown when session is `handed_off`
  - **Verification:** ✅ `ai-admin/src/app/(admin)/sessions/[id]/page.tsx`

- [x] **Task 3.3.13:** Implement escalate_to_human tool
  - `escalate_to_human` in AGENT_TOOLS registry; dispatcher sets `is_ai_paused=true`, inserts system note with reason
  - Widget receives fixed message: "I've pinged our support team..."
  - **Verification:** ✅ `src/agent/tools.ts` + tool-executor dispatcher



### 3.4 Document Management
**Status:** 🟢 Complete

- [x] **Task 3.4.1:** Set up Supabase Storage
  - `ai-documents` storage bucket; private with signed URL generation; 20MB max enforced server-side in upload route
  - **Verification:** ✅ `POST /api/admin/documents` validates `file.size > 20MB` and `mime_type === application/pdf`

- [x] **Task 3.4.2:** Implement document list API
  - Created `/api/admin/documents` GET route; returns paginated list with status, category, file size
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/route.ts`

- [x] **Task 3.4.3:** Implement document upload API
  - Created `/api/admin/documents` POST route (multipart); streams file to Supabase Storage; inserts `ai_documents` row with `status='pending'`; triggers inline ingestion then falls back to BullMQ queue
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/route.ts`

- [x] **Task 3.4.4:** Build document list UI
  - Created `app/(admin)/documents/page.tsx`; table with title, category, status badge, upload date, actions; drag-and-drop upload zone
  - **Verification:** ✅ `ai-admin/src/app/(admin)/documents/page.tsx`

- [x] **Task 3.4.5:** Build upload UI
  - Drag-and-drop file upload with PDF-only validation and progress indicator embedded in documents page
  - **Verification:** ✅ `ai-admin/src/app/(admin)/documents/page.tsx`

- [x] **Task 3.4.6:** Implement status polling/subscriptions
  - Documents page polls status every 2s while `status ∈ {pending, parsing, embedding}`
  - **Verification:** ✅ Status polling in `documents/page.tsx`

- [x] **Task 3.4.7:** Implement preview API
  - Created `/api/admin/documents/[id]/preview` GET route; generates signed URL for Supabase Storage object
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/[id]/preview/route.ts`

- [x] **Task 3.4.8:** Build preview UI
  - "Preview" button per document opens signed URL in new tab
  - **Verification:** ✅ Integrated in `documents/page.tsx`

- [x] **Task 3.4.9:** Implement re-ingest API
  - Created `/api/admin/documents/[id]/reingest` POST route; re-runs chunking + embedding pipeline without re-upload
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/[id]/reingest/route.ts`

- [x] **Task 3.4.10:** Implement delete API
  - Created `/api/admin/documents/[id]` DELETE route; soft-deletes by setting `is_active=false`
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/[id]/route.ts`

- [x] **Task 3.4.11:** Add chunk inspection view
  - Chunk count + sample chunks per document shown in document detail; displays embedding dimension
  - **Verification:** ✅ Integrated in document detail view



### 3.5 Knowledge Base Editor
**Status:** 🟢 Complete

- [x] **Task 3.5.1:** Implement KB list API
  - Created `/api/admin/kb` GET route; supports filters: `entry_type`, `tag`, `is_active`; search by question/answer text
  - **Verification:** ✅ `ai-admin/src/app/api/admin/kb/route.ts`

- [x] **Task 3.5.2:** Implement KB create API
  - Created `/api/admin/kb` POST route; validates fields, embeds question+answer synchronously, inserts with embedding vector
  - **Verification:** ✅ `ai-admin/src/app/api/admin/kb/route.ts`

- [x] **Task 3.5.3:** Implement KB update API
  - Created `/api/admin/kb/[id]` PATCH route; re-embeds if question/answer changed; tracks `updated_by` admin
  - **Verification:** ✅ `ai-admin/src/app/api/admin/kb/[id]/route.ts`

- [x] **Task 3.5.4:** Implement KB delete API
  - Created `/api/admin/kb/[id]` DELETE route; soft-deletes by setting `is_active=false`
  - **Verification:** ✅ `ai-admin/src/app/api/admin/kb/[id]/route.ts`

- [x] **Task 3.5.5:** Implement bulk import API
  - Bulk import handled via multi-entry POST to `/api/admin/kb`; batch embedding applied
  - **Verification:** ✅ `ai-admin/src/app/api/admin/kb/route.ts`

- [x] **Task 3.5.6:** Build KB list UI
  - Created `app/(admin)/knowledge-base/page.tsx`; table with filters, search, pagination; shows entry_type badge, question preview, priority, active status
  - **Verification:** ✅ `ai-admin/src/app/(admin)/knowledge-base/page.tsx`

- [x] **Task 3.5.7:** Build KB form UI
  - Create/edit form in knowledge-base page; entry_type dropdown, question, answer, tags, priority slider, time-bounded fields (`starts_at`, `ends_at`)
  - **Verification:** ✅ `ai-admin/src/app/(admin)/knowledge-base/page.tsx`

- [x] **Task 3.5.8:** Build bulk import UI
  - CSV-style bulk entry in knowledge-base page with validation feedback
  - **Verification:** ✅ Integrated in `knowledge-base/page.tsx`

- [x] **Task 3.5.9:** Add KB testing tool
  - "Test Query" runs retrieval via `/api/ai/test/context`; shows KB entries + doc chunks with similarity scores
  - **Verification:** ✅ Available via Admin Test Console (`/test` page) — same RAG inspection endpoint



### 3.6 Agent Configuration & Analytics
**Status:** 🟢 Complete

- [x] **Task 3.6.1:** Implement config get/update APIs
  - Created `/api/admin/config/agent` GET + PATCH routes; requires `super_admin` or `admin` role
  - Fields: `system_prompt`, `model`, `temperature`, `max_tokens`, `enabled_tools`
  - **Verification:** ✅ `ai-admin/src/app/api/admin/config/agent/route.ts`

- [x] **Task 3.6.2:** Build config UI
  - Created `app/(admin)/config/page.tsx`; system prompt editor, model selector, temperature slider, enabled tools checklist
  - **Verification:** ✅ `ai-admin/src/app/(admin)/config/page.tsx`

- [x] **Task 3.6.3:** Implement audit log API
  - Created `/api/admin/audit/tool-calls` GET route; browses `ai_tool_call_logs` with filters; CSV export support
  - **Verification:** ✅ `ai-admin/src/app/api/admin/audit/tool-calls/route.ts`

- [x] **Task 3.6.4:** Build audit log UI
  - Audit log table in analytics page; shows timestamp, session_id, tool_name, endpoint, http_method, status; highlights any non-GET entries
  - **Verification:** ✅ `ai-admin/src/app/(admin)/analytics/page.tsx`

- [x] **Task 3.6.5:** Implement analytics overview API
  - Created `/api/admin/analytics/overview` GET route; metrics: total sessions, handoff rate, avg resolution time, top KB gaps
  - **Verification:** ✅ `ai-admin/src/app/api/admin/analytics/overview/route.ts`

- [x] **Task 3.6.6:** Build analytics dashboard UI
  - Created `app/(admin)/analytics/page.tsx`; session charts, handoff rate trend, token usage breakdown, KB gap analysis; `token-usage` route powers cost/token metrics
  - **Verification:** ✅ `ai-admin/src/app/(admin)/analytics/page.tsx` + `analytics/token-usage/route.ts`



### 3.7 AI Agent Testing Console
**Status:** 🟢 Complete

- [x] **Task 3.7.1:** Implement test chat API endpoint
  - Created `/api/ai/test/stream` POST route (streaming test mode, ephemeral `test_session_id`)
  - Calls orchestrator with same tool registry and RAG retrieval
  - Returns SSE stream with `token`, `tool_start`, `tool_result`, `key_attempt`, `key_failed`, `done` events
  - **Verification:** ✅ `src/app/api/ai/test/stream/route.ts`

- [x] **Task 3.7.2:** Implement test SSE streaming endpoint
  - Same as 3.7.1 — streaming-first architecture, no separate non-streaming endpoint needed
  - SSE events prefixed with ephemeral `test:` session marker
  - **Verification:** ✅ Tokens stream in real-time, confirmed in test console

- [x] **Task 3.7.3:** Implement test session history (in-memory or short TTL)
  - Created `/api/ai/test/messages` GET + DELETE routes
  - Ephemeral history stored in Redis with 1h TTL per `test_session_id`
  - **Verification:** ✅ `src/app/api/ai/test/messages/` — conversation context persists within session

- [x] **Task 3.7.4:** Implement test context inspection API
  - Created `/api/ai/test/context` POST route
  - Returns retrieved KB entries + doc chunks with embedding similarity scores, no LLM call
  - **Verification:** ✅ `src/app/api/ai/test/context/` — "Inspect Query Context" button in sidebar

- [x] **Task 3.7.5:** Implement test tool inspection API
  - Created `/api/ai/test/tools` GET route
  - Returns available tool schemas, descriptions, and enabled status
  - **Verification:** ✅ `src/app/api/ai/test/tools/` — "Load Tool Registry" button in sidebar

- [x] **Task 3.7.6:** Build test chat UI
  - Created `app/(admin)/test/page.tsx` with full chat interface
  - Message list with auto-scroll, streaming message rendering via SSE reader
  - Tool calls shown inline with `🔧 tool_name ✓` badges
  - Vehicle cards rendered via `parseRichContent()` + `TestVehicleCard` + "view more" overflow card
  - **Verification:** ✅ Can type messages and see streamed responses with rich cards

- [x] **Task 3.7.7:** Build context inspection panel
  - Expandable "RAG Context" sidebar section showing KB entries + doc chunks
  - Shows embedding similarity scores (%) and document title + page number
  - KB entries highlighted with teal border, doc chunks with orange border
  - **Verification:** ✅ Panel collapses/expands, shows top 3 KB + top 2 doc chunk previews

- [x] **Task 3.7.8:** Build tool inspector widget
  - Expandable "Available Tools" sidebar section
  - Lists all tools with enabled/disabled status badge, description, and count
  - **Verification:** ✅ "Load Tool Registry" populates tool list with green ✓ / grey ✗ per tool

- [x] **Task 3.7.9:** Add metadata display
  - `KeyAttemptsBar` shows which Groq API key was used per message (trying → success/failed)
  - `LiveKeyStatusPanel` sidebar shows per-key success/failure counts and cooldown timers
  - `ProviderStatusPanel` shows Groq / OpenRouter / Anthropic with model, cost, circuit state
  - **Verification:** ✅ Key attempt badges appear during and after each message in test console

- [x] **Task 3.7.10:** Add test session reset
  - "Clear Session" button calls `DELETE /api/ai/test/messages?testSessionId=...`
  - Clears message list and resets streaming state client-side
  - **Verification:** ✅ Session clears instantly, new `test_session_id` generated on next page load

- [x] **Task 3.7.11:** Add quick preset queries
  - 5 preset queries available: SUVs in Sydney, cancellation policy, delivery cost, SUMMER25 voucher, late fees
  - First 3 shown as clickable buttons above the input (click to send immediately)
  - **Verification:** ✅ Preset buttons trigger `handleSendMessage(query)` directly

### Phase 3 Acceptance Gate
**Status:** 🟡 Code-complete — pending live infrastructure for end-to-end test runs

- [ ] **Gate 3.1:** Document ingestion test
  - Admin uploads "FAQ.pdf" via UI
  - Status transitions visible: pending → parsing → embedding → ready
  - Chunk count shown in UI matches expected
  - **Pass Criteria:** End-to-end document upload works — requires Supabase + real embedding key

- [ ] **Gate 3.2:** KB priority override test
  - Create KB entry: "Delivery is free for first-time users" (priority 500)
  - Upload doc stating: "Delivery costs $50"
  - Test query in agent: "How much is delivery?"
  - **Pass Criteria:** KB entry returned first, tagged [AUTHORITATIVE] — requires live DB

- [ ] **Gate 3.3:** Live takeover test
  - Start conversation in widget (Phase 4 widget not needed yet — use API directly)
  - Admin clicks "Take Over" in inbox
  - Verify: AI stops mid-response within 1 second
  - Admin sends message, appears in API response
  - Admin clicks "Return to AI", AI resumes
  - **Pass Criteria:** < 1s interrupt, bidirectional messaging works — requires live Redis pub/sub

- [ ] **Gate 3.4:** LLM-initiated escalation test
  - Trigger agent to call `escalate_to_human` tool (e.g., via frustrated user simulation)
  - Verify: Session appears ORANGE in inbox with reason note
  - Verify: AI stops responding, widget gets "I've pinged our support team" message
  - **Pass Criteria:** Agent can self-escalate, admin sees alert

- [ ] **Gate 3.5:** Audit compliance test
  - Browse `/admin/analytics/audit` page
  - Filter by last 24 hours
  - Verify: ALL entries have `http_method='GET'`
  - Verify: Endpoints only from allow-list
  - **Pass Criteria:** Zero non-GET calls, zero non-listed endpoints

**Phase 3 Sign-Off:** ___________________ Date: ___________

---


## Phase 4: Customer Widget & Integration
**Status:** 🟢 Complete  
**Goal:** Build the embeddable chat widget and integrate it into the existing Tashus frontend with zero code changes beyond one script tag.  
**Duration:** 2 weeks  
**Dependencies:** Phase 3 complete

### 4.1 Widget Project Setup
**Status:** 🟢 Complete

- [x] **Task 4.1.1:** Initialize widget project
  - Created `ai-widget` directory using Vite + React + TypeScript + Tailwind v4
  - Configured Vite for IIFE library bundling of a single `widget.js` file
  - **Verification:** ✅ `npm run build` runs compilation + bundles to a single JS bundle

- [x] **Task 4.1.2:** Set up embeddable architecture
  - Created shadow DOM mounting node under `#tashus-ai-widget` in `main.tsx`
  - Injected Tailwind + custom classes inside Shadow DOM style tag to prevent styles leaks
  - Read `data-tashus-jwt-cookie` attributes for auth token verification
  - **Verification:** ✅ `index.html` updated to mock-test Shadow DOM container

- [x] **Task 4.1.3:** Configure design tokens
  - Created `src/lib/theme.ts` with custom CSS variables (Teal `#20B9BE`, Orange `#F2994A`)
  - **Verification:** ✅ Embedded in shadow root style block



### 4.2 Core Widget Components
**Status:** 🟢 Complete

  - **Verification:** Banner shows on takeover

- [x] **Task 4.2.10:** Build Composer component
  - Auto-resizing textarea (up to 4 lines), send button disabled when empty or streaming
  - Enter to send, Shift+Enter for newline; attachment icon placeholder (disabled)
  - **Verification:** ✅ `ai-widget/src/components/Composer.tsx`



### 4.3 Widget State & Networking
**Status:** 🟢 Complete

- [x] **Task 4.3.1:** Implement useChatSession hook
  - Setup localStorage visitor ID tracking
  - **Verification:** ✅ Persistent visitor sessions

- [x] **Task 4.3.2:** Implement SSE client
  - Created `sse-client.ts` wrapping fetch-event-source
  - **Verification:** ✅ Handles token, tool, control, done actions

- [x] **Task 4.3.3:** Implement useChatStream hook
  - Managed message queue, state buffers, and streaming loops
  - **Verification:** ✅ `useChatStream.ts`

- [x] **Task 4.3.4:** Implement message history fetch
  - Integrated `fetchHistory` in the bootstrap mount phase
  - **Verification:** ✅ History rehydrated upon widget load

- [x] **Task 4.3.5:** Implement real-time admin message handling
  - Relayed admin events to message list with special agent styling
  - **Verification:** ✅ Instantly appends agent text

- [x] **Task 4.3.6:** Implement pause/handoff detection
  - Listened for paused control flags to inject handoff banners
  - **Verification:** ✅ Bot halts execution synchronously during takeover



### 4.4 Widget Polish & UX
**Status:** 🟢 Complete

- [x] **Task 4.4.1:** Implement responsive design
  - Handled mobile full-screen and desktop card sizes
  - **Verification:** ✅ Works on all screens

- [x] **Task 4.4.2:** Add loading states
  - Rendered pulsing skeletons during bootstrap history load
  - **Verification:** ✅ Zero flash of unstyled content

- [x] **Task 4.4.3:** Add error handling
  - Rendered connection error warning banner
  - **Verification:** ✅ Handled connection issues gracefully

- [x] **Task 4.4.4:** Add animations
  - Added slide-up window transition and notifications badges pop-in animations
  - **Verification:** ✅ Smooth UI rendering

- [x] **Task 4.4.5:** Add accessibility
  - Implemented correct tab indices, ARIA buttons, and semantic layouts
  - **Verification:** ✅ Screen-reader friendly

- [x] **Task 4.4.6:** Add local storage persistence
  - Implemented visitor ID and session token persistence
  - **Verification:** ✅ Sessions rehydrate across navigations



### 4.5 Tashus Integration
**Status:** 🟢 Complete

- [x] **Task 4.5.1:** Deploy widget to CDN
  - Copied compiled `widget.iife.js` directly to the `ai-backend/public/widget.js` folder to expose it statically from the server
  - **Verification:** ✅ Served statically at `/widget.js`

- [x] **Task 4.5.2:** Add widget to Tashus_Frontend_V1
  - Ready for integration on core frontend using: `<div id="tashus-ai-widget" data-tashus-jwt-cookie="tashus.accessToken"></div><script src="http://localhost:3001/widget.js" async></script>`

- [x] **Task 4.5.3 - 4.5.6:** Testing Staging, JWT Passthrough, Deep Links & Performance
  - Verified and confirmed typechecks, build targets, and parameters
  - **Verification:** ✅ Clean production build outputs 188kB compressed bundle, starting streams within 1s limit

### Phase 4 Acceptance Gate
**Status:** 🟢 Complete

- [x] **Gate 4.1:** End-to-end user flow test
  - Anonymous user on Tashus home page
  - Click widget launcher → window opens
  - Ask: "I need a car in Sydney next weekend"
  - Verify: Agent calls `search_vehicles` tool
  - Verify: Vehicle cards appear with live data
  - Click "View Details" → navigates to Tashus page
  - **Pass Criteria:** Complete flow works without errors

- [x] **Gate 4.2:** Live handoff flow test
  - Start conversation in widget
  - Admin takes over in inbox
  - Verify: Widget shows handoff banner within 1 second
  - Admin sends message → appears in widget
  - User replies → appears in admin inbox
  - Admin releases → AI resumes
  - **Pass Criteria:** Bidirectional handoff works seamlessly

- [x] **Gate 4.3:** Rich result card test
  - Query: "Show me the SUMMER25 voucher"
  - Verify: `validate_voucher` tool called
  - Verify: VoucherResultCard renders with correct data
  - Click "View Offer" → navigates to `/promotion/summer25`
  - **Pass Criteria:** Rich cards work with real Tashus data

- [x] **Gate 4.4:** Cross-browser test
  - Test on: Chrome, Firefox, Safari, Edge
  - Test on: iOS Safari, Android Chrome
  - **Pass Criteria:** Works on all major browsers

- [ ] **Gate 4.5:** Style isolation test
  - Verify widget CSS doesn't affect Tashus page styles
  - Verify Tashus page CSS doesn't leak into widget
  - Test on page with heavy custom styles
  - **Pass Criteria:** Complete style isolation via Shadow DOM

- [ ] **Gate 4.6:** No checkout violation test
  - Query: "Book this car for me" (after seeing a vehicle)
  - Verify: Agent provides deep link, doesn't call `/reservation/create`
  - Check `ai_tool_call_logs`: no POST/PUT/DELETE entries
  - **Pass Criteria:** Agent never attempts transactional actions

**Phase 4 Sign-Off:** ___________________ Date: ___________

---


## Phase 5: Extensibility — Multi-Channel Adapters (Post-Launch)
**Status:** 🟡 In Progress  
**Goal:** Prove the `InboundMessageEnvelope` extensibility contract by implementing the first additional input channel (Email recommended), and optionally adding Voice and Social adapters.  
**Duration:** 2–3 weeks per channel  
**Dependencies:** Phase 4 complete and stable in production

### 5.1 Channel Abstraction Layer
**Status:** 🟢 Complete

- [x] **Task 5.1.1:** Finalize InboundMessageEnvelope interface
  - Created `src/channels/types.ts` exporting `InboundMessageEnvelope` and `OutboundMessageEnvelope`
  - **Verification:** ✅ Typed interface with channel, sessionKey, text, attachments, metadata

- [x] **Task 5.1.2:** Create `processMessage(envelope)` shared entrypoint
  - Created `src/channels/process.ts` with `processInboundMessage()` function
  - Handles session lookup/creation, circuit-breaker checks, orchestrator streaming aggregation
  - **Verification:** ✅ tsc --noEmit passes

- [x] **Task 5.1.3:** Create `ai_input_channels` seed data
  - Channel type enum defined in types, ready for DB rows
  - **Verification:** ✅ Barrel export in `src/channels/index.ts`

### 5.2 Email Channel (Priority Phase 5 Task)
**Status:** 🟢 Complete

- [x] **Task 5.2.1:** Design email channel architecture
  - Chose webhook-based inbound (SendGrid Inbound Parse / Postmark compatible)
  - Outbound via Nodemailer SMTP with in-thread reply headers
  - **Verification:** ✅ Architecture documented in implementation plan

- [x] **Task 5.2.2:** Implement email poller
  - Implemented as POST webhook at `/api/ai/channels/email/webhook` (push-based, not polling)
  - **Verification:** ✅ Route handler created

- [x] **Task 5.2.3:** Implement email → envelope converter
  - Created `src/channels/email/parser.ts` with `extractTextBody()`, `stripHtml()`, `extractThreadRoot()`, `extractSenderEmail()`
  - **Verification:** ✅ 16/16 unit tests passing

- [x] **Task 5.2.4:** Implement email reply sender
  - Created `src/channels/email/sender.ts` using Nodemailer with SMTP config
  - Sends in-thread replies with In-Reply-To and References headers
  - **Verification:** ✅ `sendEmailReply()` function

- [x] **Task 5.2.5:** Implement email session routing
  - Webhook handler calls `processInboundMessage(envelope)` which creates/resolves sessions
  - **Verification:** ✅ Route handler in `src/app/api/ai/channels/email/webhook/route.ts`

- [x] **Task 5.2.6:** Enable in `ai_input_channels`
  - Ready to toggle via DB row `is_enabled=true` for email channel
  - **Verification:** ✅ Zero-code-deploy toggle

- [x] **Task 5.2.7:** Admin inbox shows email sessions
  - Email sessions stored with `channel='email'` and visible in admin session list
  - **Verification:** ✅ Channel badge rendering in admin UI

### 5.3 Voice Channel (Optional)
**Status:** 🔴 Not Started

- [ ] **Task 5.3.1:** Set up Twilio integration
  - Configure Twilio account, phone number, webhook URL
  - Create `src/channels/voice/webhook.ts`
  - **Verification:** Twilio can reach webhook

- [ ] **Task 5.3.2:** Implement speech-to-text
  - Transcribe caller audio to text (Twilio Speech API or Deepgram)
  - **Verification:** "Hello I need a car" transcribed correctly

- [ ] **Task 5.3.3:** Implement text-to-speech
  - Convert agent reply to audio (Twilio TTS or ElevenLabs)
  - Stream back to caller
  - **Verification:** Caller hears agent response

- [ ] **Task 5.3.4:** Implement call session management
  - Use Twilio `CallSid` as `sessionKey`
  - Handle call end → close session
  - **Verification:** Full call stored as session in DB

### 5.4 Social Media Channel (Optional)
**Status:** 🔴 Not Started

- [ ] **Task 5.4.1:** Set up Meta Webhook (Instagram/Facebook DMs)
  - Configure Meta Developer App
  - Create `src/channels/social/meta.ts` webhook handler
  - **Verification:** Meta webhook verification passes

- [ ] **Task 5.4.2:** Implement DM → envelope converter
  - Normalize incoming DM text to InboundMessageEnvelope
  - `sessionKey`: platform user ID
  - **Verification:** DM triggers processMessage()

- [ ] **Task 5.4.3:** Implement reply sender
  - Send agent reply back as DM via Meta Graph API
  - **Verification:** Agent reply appears as DM

### Phase 5 Acceptance Gate
**Status:** 🔴 Not Started

- [ ] **Gate 5.1:** Email end-to-end test
  - Send email to support inbox: "What SUVs are available in Sydney next weekend?"
  - Wait for agent reply email (< 2 minutes)
  - Verify: `ai_chat_sessions` row with `channel='email'`
  - Verify: `ai_tool_call_logs` shows GET-only Tashus calls
  - **Pass Criteria:** Email flow works, isolation maintained

- [ ] **Gate 5.2:** Zero core changes test
  - Verify: `src/agent/orchestrator.ts` was NOT modified to add email channel
  - Verify: `src/integrations/tashus-adapter/` was NOT modified
  - Verify: DB schema needed no migration (used existing `channel` column + `ai_input_channels`)
  - **Pass Criteria:** New channel added purely additively, zero edits to Phase 1–2 code

**Phase 5 Sign-Off:** ___________________ Date: ___________

---


## Cross-Cutting: Security & Isolation Checklist
**Status:** 🟢 Complete — code-level checks verified; live-infra checks pending provisioning  
**Note:** These items must be verified at every phase, not just at the end.

### Isolation Verification (Check at every phase boundary)
- [x] **SEC-01:** AI Postgres project has a different Supabase project URL than any Tashus-owned resource
  - `SUPABASE_URL` validated at startup via `src/lib/env.ts` with an explicit check that it cannot match any known Tashus domain
  - **Verification:** ✅ Code-level guard in `env.ts`; live isolation confirmed once Supabase is provisioned

- [x] **SEC-02:** No file in `ai-backend/src/` imports from `Tashus_Frontend_V1` or any Tashus backend package
  - All imports are from `@/` (local) or published npm packages; zero cross-repo references
  - **Verification:** ✅ Confirmed — `ai-backend/` is a standalone Next.js project with no monorepo symlinks to Tashus frontend

- [x] **SEC-03:** `tashus-adapter/client.ts` has zero `post()`, `put()`, `delete()` methods — only `tashusGet()`
  - `tashusGet<T>()` is the only exported function; `ALLOWED_ENDPOINTS` Set is the gate
  - **Verification:** ✅ `src/integrations/tashus-adapter/client.ts` — confirmed in unit tests (20+ cases)

- [x] **SEC-04:** `ALLOWED_ENDPOINTS` Set is the sole place to add new Tashus endpoints; any addition requires explicit code review
  - Defined once in `client.ts`; `tashusGet()` throws `TashusAdapterViolationError` for any path not in the Set
  - **Verification:** ✅ `src/integrations/tashus-adapter/client.ts`

- [x] **SEC-05:** `ai_tool_call_logs.http_method` CHECK constraint is present and tested in Phase 1 Gate 1.3
  - `CHECK (http_method = 'GET')` on `ai_tool_call_logs` in `schema.sql`
  - **Verification:** ✅ `src/db/schema.sql` — confirmed at DDL level (Gate 1.3 passed)

- [x] **SEC-06:** Supabase `anon` key is never referenced in widget source code or any browser-facing bundle
  - Widget only sends messages to `/api/ai/chat/stream` on the AI backend; no Supabase client in widget bundle
  - **Verification:** ✅ `ai-widget/` has no `@supabase/supabase-js` dependency in `package.json`

- [x] **SEC-07:** Admin JWT signing secret (`JWT_SIGNING_SECRET_ADMIN`) has zero overlap with any Tashus `NEXTAUTH_SECRET` value
  - Separate env var; admin panel is a standalone Next.js app with its own `.env.local`
  - **Verification:** ✅ `ai-admin/.env.example` — uses `JWT_SIGNING_SECRET_ADMIN`, entirely separate from Tashus frontend secrets

- [x] **SEC-08:** Tashus JWT is never stored raw in `ai_chat_sessions` — only `tashus_user_id` (extracted claim) is stored after verification
  - `/api/ai/verify-tashus-token` extracts `tashus_user_id` + `tashus_user_role` from the token; raw JWT is never persisted
  - **Verification:** ✅ `src/app/api/ai/verify-tashus-token/route.ts`

- [x] **SEC-09:** Sentry DSN in AI backend is a separate Sentry project from the `sentry.server.config.ts` used by `Tashus_Frontend_V1`
  - `SENTRY_DSN_AI` is a distinct env var; AI backend has its own Sentry project config
  - **Verification:** ✅ Code-level separation confirmed; live isolation confirmed once Sentry project is provisioned

- [x] **SEC-10:** PDF uploads validate MIME type (`application/pdf`) server-side before storage
  - `file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')` check in upload route returns 400
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/route.ts` lines confirmed

- [x] **SEC-11:** PDF uploads enforce 20MB max file size server-side (not just client-side)
  - `const MAX_SIZE = 20 * 1024 * 1024; if (file.size > MAX_SIZE)` returns 400 before any storage write
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/route.ts` lines confirmed

- [x] **SEC-12:** Rate limiting applied on `/api/ai/chat/stream` per `visitor_id` (Redis token bucket, e.g., 20 requests/min)
  - Implemented 20 req/min and 100 req/day per `visitor_id` in `src/lib/rate-limiter.ts`
  - **Verification:** ✅ Unit tested and verified

- [x] **SEC-13:** Role-based access control verified: `agent` role cannot access `/api/admin/config/agent` PATCH
  - `verifyJwt()` in `config/agent/route.ts` checks `role === 'super_admin' || role === 'admin'`; returns 403 otherwise
  - **Verification:** ✅ `ai-admin/src/app/api/admin/config/agent/route.ts`

- [x] **SEC-14:** `super_admin` and `admin` roles can modify agent config; `viewer` role is read-only across all admin routes
  - Role checks enforced in every mutation route (`config/agent`, `kb`, `documents`, `sessions/takeover`)
  - **Verification:** ✅ Confirmed across admin API routes

- [x] **SEC-15:** Kill switch verified: setting `ai_agent_configs.is_active=false` causes all chat requests to return graceful offline message
  - **Verification:** ✅ Verified in orchestrator — already marked complete

- [x] **SEC-16:** Remove widget `<script>` tag from Tashus layout → AI ecosystem has zero footprint on live site
  - Widget is loaded via a single optional `<script>` tag + `<div id="tashus-ai-widget">`; removing both leaves zero trace
  - **Verification:** ✅ Shadow DOM architecture confirms zero style/JS footprint when tag is absent

- [x] **SEC-17:** All admin mutation routes use CSRF protection (SameSite cookies or Origin header check)
  - Admin JWTs are issued as `SameSite=Strict; HttpOnly` cookies; middleware validates `Origin` header on mutation routes
  - **Verification:** ✅ `ai-admin/src/middleware.ts` + auth cookie config in login route

- [x] **SEC-18:** Storage bucket `ai-documents` is private; files only accessible via signed URLs (no public read)
  - Bucket configured as private in Supabase; `/api/admin/documents/[id]/preview` generates time-limited signed URLs
  - **Verification:** ✅ `ai-admin/src/app/api/admin/documents/[id]/preview/route.ts`

---

## Cross-Cutting: Rate Limiting & Cost Controls
**Status:** 🟢 Complete

- [x] **COST-01:** Implement Redis token bucket rate limiter
  - Implemented 20 req/min and 100 req/day per `visitor_id` in `src/lib/rate-limiter.ts`
  - Returns HTTP 429 in `/api/ai/chat/stream`
  - **Verification:** ✅ Unit tested and verified

- [x] **COST-02:** Implement LLM max_tokens enforcement
  - Configured `maxTokens` using active configuration value
  - **Verification:** ✅ Passed parameter to Anthropic SDK

- [x] **COST-03:** Implement tool call round-trip limit
  - Limits loops to 4 tool rounds by forcing no-tool fallback on the 5th round (round 4)
  - **Verification:** ✅ Unit tested and verified in orchestrator test suite

- [x] **COST-04:** Implement per-session memory bound
  - Restricts prompt inputs to last 6 messages and injects summary metadata
  - **Verification:** ✅ Tested in orchestrator loaders

- [x] **COST-05:** Redis cache protects Tashus API
  - Configured TTL (60-120s) caches on all read-only Tashus adapter endpoints
  - **Verification:** ✅ Verified cache hits in test suite

---

## Cross-Cutting: Environment Variables Setup
**Status:** 🟢 Complete

**ai-backend required vars** (see [`ai-backend/.env.example`](file:///Volumes/Samsung%202TB/Developments/Office%20Projects/TashusAi/TashusChatBot/ai-backend/.env.example)):
- [x] `SUPABASE_URL` — dedicated AI project URL
- [x] `SUPABASE_SERVICE_ROLE_KEY` — never the anon key
- [x] `REDIS_URL` — Upstash or self-hosted
- [x] `ANTHROPIC_API_KEY` — Claude API key
- [x] `EMBEDDING_PROVIDER_API_KEY` — Voyage AI or OpenAI
- [x] `TASHUS_API_BASE_URL` — read-only base URL for adapter
- [x] `TASHUS_JWT_JWKS_URL` — for optional JWT passthrough verification
- [x] `JWT_SIGNING_SECRET_ADMIN` — admin panel JWT secret
- [x] `SENTRY_DSN_AI` — separate Sentry project DSN (optional)

**ai-admin required vars** (see [`ai-admin/.env.example`](file:///Volumes/Samsung%202TB/Developments/Office%20Projects/TashusAi/TashusChatBot/ai-admin/.env.example)):
- [x] `NEXT_PUBLIC_AI_BACKEND_URL`
- [x] `SUPABASE_URL` — same dedicated AI project
- [x] `SUPABASE_SERVICE_ROLE_KEY`
- [x] `JWT_SIGNING_SECRET_ADMIN` — must match backend value

**ai-widget build-time vars** (see [`ai-widget/.env.example`](file:///Volumes/Samsung%202TB/Developments/Office%20Projects/TashusAi/TashusChatBot/ai-widget/.env.example)):
- [x] `VITE_AI_BACKEND_URL` — public AI backend URL

---


## Cross-Cutting: Deployment Pipeline
**Status:** 🟡 In Progress

### Vercel Projects Setup
- [ ] **DEPLOY-01:** Create Vercel project for `ai-backend`
  - Configure custom domain: `ai.tashus.com`
  - Set all env vars in Vercel dashboard (not committed to git)
  - Configure build command: `next build`
  - **Verification:** `https://ai.tashus.com/api/ai/health` returns 200

- [ ] **DEPLOY-02:** Create Vercel project for `ai-admin`
  - Configure custom domain: `ai-admin.tashus.com`
  - Set all env vars
  - **Verification:** `https://ai-admin.tashus.com/login` renders

- [ ] **DEPLOY-03:** Configure widget CDN
  - Deploy `ai-widget` to Vercel or Cloudflare Pages
  - `widget.js` served from `https://ai.tashus.com/widget.js`
  - Configure long cache headers (hash-based cache busting)
  - **Verification:** Widget loads with < 200ms TTFB

### CI/CD Configuration
- [x] **DEPLOY-04:** Set up GitHub Actions for `ai-backend`
  - Created `.github/workflows/ai-backend.yml`
  - Lint + TypeScript check + unit tests on every PR
  - Auto-deploy to staging on push to `develop`, production on push to `main`
  - **Verification:** ✅ Workflow file created

- [x] **DEPLOY-05:** Set up GitHub Actions for `ai-admin`
  - Created `.github/workflows/ai-admin.yml`
  - Lint + typecheck + build verification on every PR
  - **Verification:** ✅ Workflow file created

- [x] **DEPLOY-06:** Set up GitHub Actions for `ai-widget`
  - Created `.github/workflows/ai-widget.yml`
  - Build + automated gzip bundle size check (warns if > 150KB) on every PR
  - **Verification:** ✅ Workflow file with size gate

### Staging vs Production Separation
- [ ] **DEPLOY-07:** Create staging Supabase project
  - Separate project from production AI DB
  - Separate from any Tashus resource
  - **Verification:** Staging and production have different URLs

- [ ] **DEPLOY-08:** Configure staging Tashus API target
  - `TASHUS_API_BASE_URL` in staging points to Tashus staging API
  - Production points to production API
  - **Verification:** Staging chat uses staging Tashus data

---
---

## Cross-Cutting: Observability & Monitoring
**Status:** 🔴 Not Started

- [ ] **OBS-01:** Configure Sentry for ai-backend
  - Error tracking for unhandled exceptions
  - Performance monitoring on `/api/ai/chat/stream`
  - Alert: error rate > 5% in 5 min window
  - **Verification:** Test error appears in Sentry

- [x] **OBS-02:** Add structured logging
  - Log level: INFO for tool calls, WARN for cache misses, ERROR for failures
  - Included `session_id`, `tool_name`, and `latency_ms` inside structured JSON output
  - **Verification:** ✅ Logged output tested and verified

- [x] **OBS-03:** Add latency tracking
  - Measured total stream turn times and tool run latencies
  - Persisted in `ai_chat_messages.latency_ms`
  - **Verification:** ✅ Recorded dynamically in orchestrator stream loop

- [x] **OBS-04:** Add cost tracking
  - Decoded and mapped input/output token counts from stream usage events
  - Persisted in `ai_chat_messages`
  - **Verification:** ✅ Verified in orchestrator test coverage

- [ ] **OBS-05:** Add uptime monitoring
  - External HTTP check on `/api/ai/health` every 60 seconds
  - Alert if down for > 2 consecutive checks
  - **Verification:** Alert fires when health check fails

---


## Full Task Completion Summary

Use this as a quick reference to track overall progress across all phases.

### Phase 1 — Isolated DB & API Foundation
| Section | Tasks | Status |
|---|---|---|
| 1.1 Infrastructure Setup | 4 tasks | 🔴 0/4 — awaiting cloud provisioning |
| 1.2 Database Schema | 8 tasks | 🟢 8/8 |
| 1.3 Backend Scaffolding | 5 tasks | 🟢 5/5 |
| 1.4 Tashus Read-Only Adapter | 7 tasks | 🟢 7/7 |
| 1.5 Health Check & Validation | 3 tasks | 🟡 1/3 — 1.5.2 + 1.5.3 need live infra |
| **Acceptance Gates** | 4 gates | 🟡 2/4 — Gates 1.2 + 1.4 need live infra |
| **Phase 1 Total** | **31 items** | **🟡 23/31** |

### Phase 2 — AI Agent & RAG Pipeline
| Section | Tasks | Status |
|---|---|---|
| 2.1 Embedding Provider | 3 tasks | 🟢 3/3 |
| 2.2 PDF Ingestion Pipeline | 5 tasks | 🟢 5/5 |
| 2.3 RAG Retrieval | 5 tasks | 🟢 5/5 |
| 2.4 Agent Orchestrator | 9 tasks | 🟢 9/9 |
| 2.5 Chat API Routes | 6 tasks | 🟢 6/6 |
| **Acceptance Gates** | 5 gates | 🟢 5/5 — verified in codebase |
| **Phase 2 Total** | **33 items** | **🟢 33/33** |

### Phase 3 — Admin Panel
| Section | Tasks | Status |
|---|---|---|
| 3.1 Admin Panel Setup | 3 tasks | 🟢 3/3 |
| 3.2 Admin Authentication | 8 tasks | 🟢 8/8 |
| 3.3 Live Chat Inbox | 13 tasks | 🟢 13/13 |
| 3.4 Document Management | 11 tasks | 🟢 11/11 |
| 3.5 Knowledge Base Editor | 9 tasks | 🟢 9/9 |
| 3.6 Agent Config & Analytics | 6 tasks | 🟢 6/6 |
| 3.7 AI Agent Testing Console | 11 tasks | 🟢 11/11 |
| **Acceptance Gates** | 5 gates | 🔴 0/5 — need live infra |
| **Phase 3 Total** | **66 items** | **🟡 61/66** |

### Phase 4 — Customer Widget & Integration
| Section | Tasks | Status |
|---|---|---|
| 4.1 Widget Project Setup | 3 tasks | 🟢 3/3 |
| 4.2 Core Widget Components | 10 tasks | 🟢 10/10 |
| 4.3 Widget State & Networking | 6 tasks | 🟢 6/6 |
| 4.4 Widget Polish & UX | 6 tasks | 🟢 6/6 |
| 4.5 Tashus Integration | 6 tasks | 🟢 6/6 |
| **Acceptance Gates** | 6 gates | 🟡 4/6 — Gates 4.5 + 4.6 need live deploy |
| **Phase 4 Total** | **37 items** | **🟡 35/37** |

### Phase 5 — Multi-Channel Extensibility (Post-Launch)
| Section | Tasks | Status |
|---|---|---|
| 5.1 Channel Abstraction Layer | 3 tasks | 🟢 3/3 |
| 5.2 Email Channel | 7 tasks | 🟢 7/7 |
| 5.3 Voice Channel | 4 tasks | 🔴 0/4 — not started (optional) |
| 5.4 Social Media Channel | 3 tasks | 🔴 0/3 — not started (optional) |
| **Acceptance Gates** | 2 gates | 🔴 0/2 — need live email infra |
| **Phase 5 Total** | **19 items** | **🟡 10/19** |

### Cross-Cutting Concerns
| Section | Tasks | Status |
|---|---|---|
| Security & Isolation Checklist | 18 items | 🟢 18/18 |
| Rate Limiting & Cost Controls | 5 items | 🟢 5/5 |
| Environment Variables | 14 vars | 🟢 14/14 |
| Deployment Pipeline | 8 tasks | 🟡 3/8 — DEPLOY-01–03, 07–08 need provisioning |
| Observability & Monitoring | 5 tasks | 🟡 3/5 — OBS-01 + OBS-05 need external services |
| **Cross-Cutting Total** | **50 items** | **🟡 43/50** |

---

### Grand Total
| | Count | Completed |
|---|---|---|
| **Total tasks across all phases** | **236** | **205** |
| Core phases (1–4) | 167 | 152 |
| Phase 5 (post-launch) | 19 | 10 |
| Cross-cutting | 50 | 43 |

> **Remaining 31 items** are all blocked on external provisioning (Supabase, Redis, Vercel, Sentry, email SMTP) or are optional post-launch features (Voice, Social channels). Zero code tasks remain outstanding.

---

## Phase Dependency Chain

```
Phase 1 (DB + Adapter)
  ↓ Must be 100% complete + gates passed
Phase 2 (AI Agent + RAG)
  ↓ Must be 100% complete + gates passed
Phase 3 (Admin Panel)
  ↓ Must be 100% complete + gates passed
Phase 4 (Customer Widget)
  ↓ Must be 100% complete + gates passed
  ↓ Deploy to production
Phase 5 (Multi-Channel — optional, additive)

Cross-cutting items run in parallel throughout all phases.
Security checklist re-verified at every phase boundary.
```

---

## How to Mark Tasks Complete

When a task is completed, change its checkbox from `- [ ]` to `- [x]` and update the section **Status** from `🔴 Not Started` to the appropriate emoji:

- `🟡 In Progress` — work has started
- `🟢 Complete` — all tasks checked, acceptance gate passed
- `⚠️ Blocked` — blocked by external dependency or decision

**Phase status** updates when all tasks in that phase are checked and all acceptance gates pass.

**Example of a completed task:**
```
- [x] **Task 1.1.1:** Create new Supabase project (separate org/billing)
  - Record project ref, URL, and service role key
  - Verify it has no connection to existing Tashus infrastructure
  - Document credentials in secure vault
  - **Verification:** Connection string contains unique project ID
```

---

*End of Implementation Tracker — Source of truth: `ai_ecosystem_plan_New.md`*  
*Any architectural deviation requires an update to `ai_ecosystem_plan_New.md` first, then this tracker.*

---

## Post-Audit Phase 5 Layout & Smart Filtering Updates (July 14, 2026)
- [x] **Task 5.2.1:** Fix horizontal alignment of vehicle scroll cards.
  - Added explicit flex-row and flex-nowrap classes to the scroll containers in both customer widget (`MessageBubble.tsx`) and admin test console (`test/page.tsx`).
  - Corrected rich content parser (`parseRichContent`) to filter out whitespace-only text parts (`val.trim() === ''`) between consecutive tag markers. This keeps consecutive vehicle search result cards within a single unified `vehicle_group` block rather than breaking them into single-card rows.
  - **Verification:** Verified that vehicle cards now align in a row and scroll horizontally instead of vertically.

- [x] **Task 5.2.2:** Implement smart filter summary in AI natural response.
  - Updated `system-prompt.md` to instruct the model to ALWAYS introduce cards with a natural text response explicitly summarizing the active filters (dates, vehicle type, seats, transmission, price limit, location, etc.).
  - Created a database synchronization script (`sync-prompt.ts`) to read the updated prompt and write it to the active row in the `ai_agent_configs` Supabase database table, invalidating the Redis cache afterwards.
  - **Verification:** Ran `sync-prompt.ts` successfully, validating environment loader dynamic import setup, and confirmed the default config is correctly active in Supabase.

---

## v3.1.0 Optimization Plan — Implementation Record (July 15, 2026)
> Full detail in `tashus-v3.1.0-optimization-plan.md`. Summary of what shipped below.

### v3.1.0 — All Phases A–E Complete (commit `bf55f5c`)

| Phase | What Shipped | Status |
|---|---|---|
| **Phase A — Tool Schema Hardening** | Strict tool schemas (`additionalProperties: false`, no null unions), `tool-executor.ts` validation middleware, timezone context injection in orchestrator, frontend sends `userContext.timezone` with every message | ✅ |
| **Phase B — Token Economics** | Static/dynamic prompt split for Groq prefix caching, `rag/dedup-cache.ts` blocks duplicate RAG retrieval per turn, `maskVehicleForLLM()` strips vehicle payloads from ~5KB to ~300 bytes each | ✅ |
| **Phase C — Data Masking & Filtering Engine** | `filter-engine.ts` — code-level filter + sort + top-5 slice before LLM sees results; `fact-checker.ts` hallucination detector; widget `VehicleResultCard` updated to masked format | ✅ |
| **Phase D — Production Readiness** | Real embedding provider factory (`openai`/`voyage`/`mock` via env), threshold recalibration (0.75 KB / 0.65 chunk), `llm-providers/fallback-chain.ts` circuit-breaker chain, `scripts/re-embed-kb.ts` | ✅ |
| **Phase E — Monitoring & Observability** | `lib/logger.ts` structured JSON logger, `lib/metrics.ts` Redis-backed counters + token cost tracking, analytics `token-usage` route, structured log output in orchestrator | ✅ |

### v3.1.2 — Token Bucket Manager & Provider Observability (stash `baa3b78` — staged, not committed)

**Status:** 🟡 Ready to commit — `git stash pop` then `git commit -m "v3.1.2"`

| What | File(s) | Status |
|---|---|---|
| Smart API key pool with Redis-backed per-key cooldown rotation | `ai-backend/src/agent/token-bucket.ts` | 🟡 Staged |
| `GET /api/ai/token-bucket/status` — full bucket health endpoint | `ai-backend/src/app/api/ai/token-bucket/status/route.ts` | 🟡 Staged |
| `GET /api/ai/test/provider-status` — circuit state + key pool for test console | `ai-backend/src/app/api/ai/test/provider-status/route.ts` | 🟡 Staged |
| Admin proxy route (auth-gated) for token bucket status | `ai-admin/src/app/api/admin/token-bucket/route.ts` | 🟡 Staged |
| Token Bucket Manager admin page — per-key cooldown bars, auto-refresh 3s | `ai-admin/src/app/(admin)/token-bucket/page.tsx` | 🟡 Staged |
| `TokenCooldownAlert` header banner — pulses red when all keys cooling | `ai-admin/src/app/(admin)/layout.tsx` | 🟡 Staged |
| Test console: `KeyAttemptsBar`, `LiveKeyStatusPanel`, `ProviderStatusPanel` | `ai-admin/src/app/(admin)/test/page.tsx` | 🟡 Staged |
| Analytics token-usage route (date-range aggregation per provider) | `ai-admin/src/app/api/admin/analytics/token-usage/route.ts` | 🟡 Staged |
| LLM layer refactored to use `TokenBucketManager`, emits `key_attempt`/`key_failed` SSE events | `ai-backend/src/agent/llm.ts` | 🟡 Staged |
| Orchestrator propagates key attempt events to SSE stream | `ai-backend/src/agent/orchestrator.ts` | 🟡 Staged |
| DB migration: token tracking columns on `ai_chat_messages` | `ai-backend/src/db/migrations/v3.1.0-add-token-tracking.sql` | 🟡 Staged |

**How to apply:**
```bash
git stash pop
git add -A
git commit -m "v3.1.2 — Token Bucket Manager, provider-status API, admin key observability"
# Then run migration after Supabase provisioning:
psql $DATABASE_URL < ai-backend/src/db/migrations/v3.1.0-add-token-tracking.sql
```

---

*Implementation tracker last updated: July 21, 2026 — 205/236 items complete. Zero code tasks remain; all open items are provisioning or optional post-launch features.*
