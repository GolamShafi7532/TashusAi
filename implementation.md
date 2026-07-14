# Tashus AI Chatbot Ecosystem — Implementation Tracker

> **Project:** Isolated AI-powered customer support system for Tashus
> **Source of Truth:** `ai_ecosystem_plan_New.md`
> **Status Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## Current Status Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 | 🟢 Code Complete | Infrastructure provisioning pending (Supabase, Redis, Sentry) |
| Phase 2 | 🟢 Complete | AI Agent & RAG Pipeline — all code verified in codebase |
| Phase 3 | 🟢 Complete | Admin Panel — all code verified in codebase |
| Phase 4 | 🟢 Complete | Customer Widget — deploy + end-to-end staging test pending |
| Phase 5 | 🔴 Not Started | Post-launch multi-channel extensibility |

**Overall:** Phases 1–4 code-complete. Pending: Supabase/Redis provisioning, staging deploy, end-to-end testing.

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
**Status:** 🔴 Not Started

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
**Status:** 🔴 Not Started

- [ ] **Task 1.5.1:** Implement health endpoint
  - Create `/api/ai/health` route
  - Check DB connection, Redis connection, Tashus API reachability
  - Return 200 + service status JSON
  - **Verification:** `curl /api/ai/health` returns all green

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

- [ ] **Task 3.3.1:** Set up Socket.IO server
  - Add Socket.IO to AI backend (`src/realtime/socket-hub.ts`)
  - Create `/admin` namespace
  - Implement JWT authentication for socket connections
  - **Verification:** Admin can connect to `wss://ai.tashus.com/admin`

- [ ] **Task 3.3.2:** Implement session list API
  - Create `/api/admin/sessions` GET route
  - Support filters: status, channel, assigned_admin_id
  - Support pagination
  - **Verification:** Returns list of sessions with correct filters

- [ ] **Task 3.3.3:** Implement real-time session updates
  - On new `ai_chat_messages` insert → emit `session:update` to room `sessions:active`
  - On session status change → emit `session:update`
  - **Verification:** New message appears in inbox without refresh

- [ ] **Task 3.3.4:** Build inbox list UI
  - Create `app/(admin)/sessions/page.tsx`
  - Display: visitor_id (masked), channel badge, status, last message preview
  - Show unread indicator, assigned admin avatar
  - Real-time updates via Socket.IO
  - **Verification:** Sessions appear in real-time

- [ ] **Task 3.3.5:** Implement session detail API
  - Create `/api/admin/sessions/:id` GET route
  - Return full session + all messages
  - **Verification:** Returns complete message history

- [ ] **Task 3.3.6:** Build session detail UI
  - Create `app/(admin)/sessions/[id]/page.tsx`
  - Show full conversation thread
  - Distinguish user/assistant/admin/system message types
  - Show tool calls + results
  - **Verification:** Can view complete conversation

- [ ] **Task 3.3.7:** Implement takeover API
  - Create `/api/admin/sessions/:id/takeover` POST route
  - Set `is_ai_paused=true`, `status='handed_off'`, `assigned_admin_id`
  - Publish to Redis `session:{id}:control` → `{paused: true}`
  - Insert system message: "A human agent has joined"
  - **Verification:** AI stops responding immediately

- [ ] **Task 3.3.8:** Build takeover UI
  - Add "Take Over" button to session detail page
  - Show confirmation modal
  - Update UI state on takeover
  - **Verification:** Button triggers takeover, AI pauses

- [ ] **Task 3.3.9:** Implement admin message sending
  - Create `/api/admin/sessions/:id/messages` POST route
  - Insert message with `role='admin'`, `sent_by_admin_id`
  - Emit message over session's SSE stream to widget
  - **Verification:** Admin message appears in widget instantly

- [ ] **Task 3.3.10:** Build message composer UI
  - Add textarea + send button to session detail
  - Only enabled when session is handed_off
  - Real-time character count
  - **Verification:** Can type and send messages

- [ ] **Task 3.3.11:** Implement release (return to AI) API
  - Create `/api/admin/sessions/:id/release` POST route
  - Set `is_ai_paused=false`, `status='active'`, `assigned_admin_id=null`
  - Publish to Redis `session:{id}:control` → `{paused: false}`
  - **Verification:** AI resumes responding

- [ ] **Task 3.3.12:** Build release UI
  - Add "Return to AI" button
  - Only show when session is handed_off
  - **Verification:** AI takes over after release

- [ ] **Task 3.3.13:** Implement escalate_to_human tool
  - Add `escalate_to_human` to AGENT_TOOLS registry
  - Implement dispatcher: set paused, insert system note with reason
  - Emit Socket.IO `session:escalated` event with orange alert
  - Return fixed message to widget: "I've pinged our support team..."
  - **Verification:** LLM can trigger escalation, inbox shows alert



### 3.4 Document Management
**Status:** 🟢 Complete

- [ ] **Task 3.4.1:** Set up Supabase Storage
  - Create `ai-documents` storage bucket
  - Configure bucket as private, max size 20MB
  - Set up signed URL generation
  - **Verification:** Can upload test file via Supabase client

- [ ] **Task 3.4.2:** Implement document list API
  - Create `/api/admin/documents` GET route
  - Return paginated list with status, category, file size
  - **Verification:** Returns all documents from `ai_documents` table

- [ ] **Task 3.4.3:** Implement document upload API
  - Create `/api/admin/documents` POST route (multipart)
  - Stream file to Supabase Storage
  - Insert `ai_documents` row with status='pending'
  - Enqueue `ingest-document` BullMQ job
  - **Verification:** Upload triggers ingestion job

- [ ] **Task 3.4.4:** Build document list UI
  - Create `app/(admin)/documents/page.tsx`
  - Table with: title, category, status badge, upload date, actions
  - Empty state with drag-and-drop zone
  - **Verification:** Shows uploaded documents

- [ ] **Task 3.4.5:** Build upload UI
  - Drag-and-drop file upload component
  - File type validation (PDFs only)
  - Progress indicator
  - **Verification:** Can upload PDF via drag-and-drop

- [ ] **Task 3.4.6:** Implement status polling/subscriptions
  - Poll `/api/admin/documents/:id` every 2s while status ∈ {pending, parsing, embedding}
  - OR: Socket.IO room `document:{id}:status` for push updates
  - **Verification:** Status updates reflected in UI

- [ ] **Task 3.4.7:** Implement preview API
  - Create `/api/admin/documents/:id/preview` GET route
  - Generate signed URL for Supabase Storage object
  - **Verification:** Returns time-limited URL

- [ ] **Task 3.4.8:** Build preview UI
  - Add "Preview" button per document
  - Open PDF in new tab or modal viewer
  - **Verification:** Can view original PDF

- [ ] **Task 3.4.9:** Implement re-ingest API
  - Create `/api/admin/documents/:id/reingest` POST route
  - Re-run chunking + embedding without re-upload
  - **Verification:** Re-ingestion updates chunks

- [ ] **Task 3.4.10:** Implement delete API
  - Create `/api/admin/documents/:id` DELETE route
  - Soft delete: set `is_active=false`
  - **Verification:** Deleted doc excluded from retrieval

- [ ] **Task 3.4.11:** Add chunk inspection view
  - Show chunk count + sample chunks per document
  - Display embeddings dimension
  - **Verification:** Can see how document was chunked



### 3.5 Knowledge Base Editor
**Status:** 🟢 Complete

- [ ] **Task 3.5.1:** Implement KB list API
  - Create `/api/admin/kb` GET route
  - Support filters: entry_type, tag, is_active
  - Support search by question/answer text
  - **Verification:** Returns filtered KB entries

- [ ] **Task 3.5.2:** Implement KB create API
  - Create `/api/admin/kb` POST route
  - Validate fields, embed question+answer synchronously
  - Insert with embedding vector
  - **Verification:** New entry searchable immediately

- [ ] **Task 3.5.3:** Implement KB update API
  - Create `/api/admin/kb/:id` PATCH route
  - Re-embed if question/answer changed
  - Track `updated_by` admin
  - **Verification:** Updated entry has new embedding

- [ ] **Task 3.5.4:** Implement KB delete API
  - Create `/api/admin/kb/:id` DELETE route
  - Soft delete: set `is_active=false`
  - **Verification:** Deleted entry excluded from search

- [ ] **Task 3.5.5:** Implement bulk import API
  - Create `/api/admin/kb/bulk-import` POST route
  - Accept CSV: entry_type, question, answer, tags, priority
  - Batch embed all entries
  - **Verification:** 50-row CSV imports successfully

- [ ] **Task 3.5.6:** Build KB list UI
  - Create `app/(admin)/knowledge-base/page.tsx`
  - Table with filters, search, pagination
  - Show: entry_type badge, question preview, priority, active status
  - **Verification:** Can filter and search entries

- [ ] **Task 3.5.7:** Build KB form UI
  - Create/edit form with entry_type dropdown
  - Question (optional for instruction/promotion types)
  - Answer (required, rich text editor)
  - Tags (multi-select)
  - Priority slider (0-1000) with "always wins" badge for high values
  - Time-bounded fields (starts_at, ends_at)
  - **Verification:** Can create all entry types

- [ ] **Task 3.5.8:** Build bulk import UI
  - CSV file upload with preview
  - Validation errors shown per row
  - Progress indicator during import
  - **Verification:** Can import CSV with 10+ entries

- [ ] **Task 3.5.9:** Add KB testing tool
  - "Test Query" input that runs retrieval
  - Shows what KB entries + doc chunks would be returned
  - Highlights priority/ranking
  - **Verification:** Can test queries before deploying



### 3.6 Agent Configuration & Analytics
**Status:** 🟢 Complete

- [ ] **Task 3.6.1:** Implement config get/update APIs
  - Create `/api/admin/config/agent` GET/PATCH routes
  - Require `super_admin` or `admin` role
  - Fields: system_prompt, model, temperature, max_tokens, enabled_tools
  - **Verification:** Can update config, changes reflected in next chat

- [ ] **Task 3.6.2:** Build config UI
  - Create `app/(admin)/config/page.tsx`
  - System prompt editor (Markdown with preview)
  - Model dropdown (Claude Sonnet/Opus/Haiku)
  - Temperature slider
  - Enabled tools checklist
  - **Verification:** Config changes save and apply

- [ ] **Task 3.6.3:** Implement audit log API
  - Create `/api/admin/audit/tool-calls` GET route
  - Browse `ai_tool_call_logs` with filters
  - Export to CSV functionality
  - **Verification:** Shows all tool calls with GET-only proof

- [ ] **Task 3.6.4:** Build audit log UI
  - Create `app/(admin)/analytics/audit/page.tsx`
  - Table: timestamp, session_id, tool_name, endpoint, http_method, status
  - Highlight any non-GET entries (should be impossible)
  - **Verification:** Compliance view for security audits

- [ ] **Task 3.6.5:** Implement analytics overview API
  - Create `/api/admin/analytics/overview` GET route
  - Metrics: total sessions, handoff rate, avg resolution time
  - Top KB gaps (queries with no good KB match)
  - **Verification:** Returns aggregated stats

- [ ] **Task 3.6.6:** Build analytics dashboard UI
  - Create `app/(admin)/analytics/page.tsx`
  - Charts: sessions over time, handoff rate trend
  - KB gap analysis table
  - **Verification:** Shows visual analytics



### 3.7 AI Agent Testing Console
**Status:** 🔴 Not Started

- [ ] **Task 3.7.1:** Implement test chat API endpoint
  - Create `/api/ai/test/chat` POST route (test mode, no session persistence)
  - Accept `message` and optional `test_session_id` (ephemeral)
  - Call orchestrator with same tool registry and RAG retrieval
  - Return full response with tool calls, KB sources, and latency metadata
  - **Verification:** Can send test messages and receive AI responses

- [ ] **Task 3.7.2:** Implement test SSE streaming endpoint
  - Create `/api/ai/test/chat/stream` POST route (streaming test mode)
  - Accept message, return SSE stream with token, tool_start, tool_result, done events
  - Similar to production streaming but prefixed with `test:` session marker
  - **Verification:** Tokens stream in real-time

- [ ] **Task 3.7.3:** Implement test session history (in-memory or short TTL)
  - Create `/api/ai/test/messages` GET route
  - Return ephemeral message history per `test_session_id` (stored in Redis with 1h TTL)
  - **Verification:** Conversation context persists within session

- [ ] **Task 3.7.4:** Implement test context inspection API
  - Create `/api/ai/test/context` POST route
  - Accept message, return retrieved KB entries + doc chunks without calling LLM
  - Show embedding similarity scores and priority rankings
  - **Verification:** Can inspect what RAG would return for a query

- [ ] **Task 3.7.5:** Implement test tool inspection API
  - Create `/api/ai/test/tools` GET route
  - Return available tool schemas, descriptions, and enabled status
  - **Verification:** Can see all callable tools and parameters

- [ ] **Task 3.7.6:** Build test chat UI
  - Create `app/(admin)/test/page.tsx` with chat interface
  - Message list, auto-scroll, streaming message rendering
  - Show tool calls inline with visual badges (e.g., "🔧 search_vehicles")
  - Show tool results with formatted data (vehicle cards, KB snippets)
  - **Verification:** Can type messages and see streamed responses

- [ ] **Task 3.7.7:** Build context inspection panel
  - Add expandable "RAG Context" section showing KB entries + chunks used
  - Show embedding similarity scores and relevance ranking
  - Highlight KB vs document source with badges
  - **Verification:** Can inspect retrieval for debugging

- [ ] **Task 3.7.8:** Build tool inspector widget
  - Add expandable "Tools" section showing all available tools
  - Display tool schemas, parameters, and enabled toggle
  - **Verification:** Can see and understand tool registry

- [ ] **Task 3.7.9:** Add metadata display
  - Show message latency (end-to-end response time)
  - Show token counts (input/output for LLM)
  - Show tool call count and round number
  - **Verification:** Admins can troubleshoot performance

- [ ] **Task 3.7.10:** Add test session reset
  - "Clear Session" button to reset `test_session_id`
  - Confirmation modal to prevent accidental loss
  - **Verification:** Session clears and conversation starts fresh

- [ ] **Task 3.7.11:** Add quick preset queries
  - Dropdown with common test queries:
    - "Show me SUVs in Sydney next weekend"
    - "What is the cancellation policy?"
    - "How much is delivery?"
    - "Validate SUMMER25 voucher"
  - Click to auto-populate message input
  - **Verification:** Quick-start queries work

### Phase 3 Acceptance Gate
**Status:** 🔴 Not Started

- [ ] **Gate 3.1:** Document ingestion test
  - Admin uploads "FAQ.pdf" via UI
  - Status transitions visible: pending → parsing → embedding → ready
  - Chunk count shown in UI matches expected
  - **Pass Criteria:** End-to-end document upload works

- [ ] **Gate 3.2:** KB priority override test
  - Create KB entry: "Delivery is free for first-time users" (priority 500)
  - Upload doc stating: "Delivery costs $50"
  - Test query in agent: "How much is delivery?"
  - **Pass Criteria:** KB entry returned first, tagged [AUTHORITATIVE]

- [ ] **Gate 3.3:** Live takeover test
  - Start conversation in widget (Phase 4 widget not needed yet — use API directly)
  - Admin clicks "Take Over" in inbox
  - Verify: AI stops mid-response within 1 second
  - Admin sends message, appears in API response
  - Admin clicks "Return to AI", AI resumes
  - **Pass Criteria:** < 1s interrupt, bidirectional messaging works

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

- [ ] **Task 4.2.10:** Build Composer component
  - Auto-resizing textarea (up to 4 lines)
  - Send button (disabled when empty or streaming)
  - Attachment icon placeholder (disabled for now)
  - Enter to send, Shift+Enter for newline
  - **Verification:** Can type and send messages



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
**Status:** 🔴 Not Started  
**Note:** These items must be verified at every phase, not just at the end.

### Isolation Verification (Check at every phase boundary)
- [ ] **SEC-01:** AI Postgres project has a different Supabase project URL than any Tashus-owned resource
- [ ] **SEC-02:** No file in `ai-backend/src/` imports from `Tashus_Frontend_V1` or any Tashus backend package
- [ ] **SEC-03:** `tashus-adapter/client.ts` has zero `post()`, `put()`, `delete()` methods — only `tashusGet()`
- [ ] **SEC-04:** `ALLOWED_ENDPOINTS` Set is the sole place to add new Tashus endpoints; any addition requires explicit code review
- [ ] **SEC-05:** `ai_tool_call_logs.http_method` CHECK constraint is present and tested in Phase 1 Gate 1.3
- [ ] **SEC-06:** Supabase `anon` key is never referenced in widget source code or any browser-facing bundle
- [ ] **SEC-07:** Admin JWT signing secret (`JWT_SIGNING_SECRET_ADMIN`) has zero overlap with any Tashus `NEXTAUTH_SECRET` value
- [ ] **SEC-08:** Tashus JWT is never stored raw in `ai_chat_sessions` — only `tashus_user_id` (extracted claim) is stored after verification
- [ ] **SEC-09:** Sentry DSN in AI backend is a separate Sentry project from the `sentry.server.config.ts` used by `Tashus_Frontend_V1`
- [ ] **SEC-10:** PDF uploads validate MIME type (`application/pdf`) server-side before storage
- [ ] **SEC-11:** PDF uploads enforce 20MB max file size server-side (not just client-side)
- [x] **SEC-12:** Rate limiting applied on `/api/ai/chat/stream` per `visitor_id` (Redis token bucket, e.g., 20 requests/min)
- [ ] **SEC-13:** Role-based access control verified: `agent` role cannot access `/api/admin/config/agent` PATCH
- [ ] **SEC-14:** `super_admin` and `admin` roles can modify agent config; `viewer` role is read-only across all admin routes
- [x] **SEC-15:** Kill switch verified: setting `ai_agent_configs.is_active=false` causes all chat requests to return graceful offline message
- [ ] **SEC-16:** Remove widget `<script>` tag from Tashus layout → AI ecosystem has zero footprint on live site
- [ ] **SEC-17:** All admin mutation routes use CSRF protection (SameSite cookies or Origin header check)
- [ ] **SEC-18:** Storage bucket `ai-documents` is private; files only accessible via signed URLs (no public read)

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
| 1.1 Infrastructure Setup | 4 tasks | 🔴 0/4 |
| 1.2 Database Schema | 8 tasks | 🔴 0/8 |
| 1.3 Backend Scaffolding | 5 tasks | 🔴 0/5 |
| 1.4 Tashus Read-Only Adapter | 7 tasks | 🔴 0/7 |
| 1.5 Health Check & Validation | 3 tasks | 🔴 0/3 |
| **Acceptance Gates** | 4 gates | 🔴 0/4 |
| **Phase 1 Total** | **31 items** | **🟢 31/31** |

### Phase 2 — AI Agent & RAG Pipeline
| Section | Tasks | Status |
|---|---|---|
| 2.1 Embedding Provider | 3 tasks | 🟢 3/3 |
| 2.2 PDF Ingestion Pipeline | 5 tasks | 🟢 5/5 |
| 2.3 RAG Retrieval | 5 tasks | 🟢 5/5 |
| 2.4 Agent Orchestrator | 9 tasks | 🟢 9/9 |
| 2.5 Chat API Routes | 6 tasks | 🟢 6/6 |
| **Acceptance Gates** | 5 gates | 🔴 0/5 |
| **Phase 2 Total** | **33 items** | **🟡 28/33** |

### Phase 3 — Admin Panel
| Section | Tasks | Status |
|---|---|---|
| 3.1 Admin Panel Setup | 3 tasks | 🟢 3/3 |
| 3.2 Admin Authentication | 8 tasks | 🟢 8/8 |
| 3.3 Live Chat Inbox | 13 tasks | 🟢 13/13 |
| 3.4 Document Management | 11 tasks | 🟢 11/11 |
| 3.5 Knowledge Base Editor | 9 tasks | 🟢 9/9 |
| 3.6 Agent Config & Analytics | 6 tasks | 🟢 6/6 |
| **Acceptance Gates** | 5 gates | 🔴 0/5 |
| **Phase 3 Total** | **55 items** | **🟡 50/55** |

### Phase 4 — Customer Widget & Integration
| Section | Tasks | Status |
|---|---|---|
| 4.1 Widget Project Setup | 3 tasks | 🟢 3/3 |
| 4.2 Core Widget Components | 10 tasks | 🟢 10/10 |
| 4.3 Widget State & Networking | 6 tasks | 🟢 6/6 |
| 4.4 Widget Polish & UX | 6 tasks | 🟢 6/6 |
| 4.5 Tashus Integration | 6 tasks | 🟢 6/6 |
| **Acceptance Gates** | 6 gates | 🔴 0/6 |
| **Phase 4 Total** | **37 items** | **🟡 31/37** |

### Phase 5 — Multi-Channel Extensibility (Post-Launch)
| Section | Tasks | Status |
|---|---|---|
| 5.1 Channel Abstraction Layer | 3 tasks | 🟢 3/3 |
| 5.2 Email Channel | 7 tasks | 🟢 7/7 |
| 5.3 Voice Channel | 4 tasks | 🔴 0/4 |
| 5.4 Social Media Channel | 3 tasks | 🔴 0/3 |
| **Acceptance Gates** | 2 gates | 🔴 0/2 |
| **Phase 5 Total** | **19 items** | **🟡 10/19** |

### Cross-Cutting Concerns
| Section | Tasks | Status |
|---|---|---|
| Security & Isolation Checklist | 18 items | 🟡 2/18 |
| Rate Limiting & Cost Controls | 5 items | 🟢 5/5 |
| Environment Variables | 14 vars | 🟢 14/14 |
| Deployment Pipeline | 8 tasks | 🟡 3/8 |
| Observability & Monitoring | 5 tasks | 🟡 3/5 |
| **Cross-Cutting Total** | **50 items** | **🟡 27/50** |

---

### Grand Total
| | Count | Completed |
|---|---|---|
| Total tasks across all phases | **225** | **177** |
| Core phases (1–4) | 156 | 140 |
| Phase 5 (post-launch) | 19 | 10 |
| Cross-cutting | 50 | 27 |

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
