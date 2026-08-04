# Tashus AI Chatbot — Project Blueprint

> **Version:** 3.2.0
> **Last Updated:** 2026-08-03
> **Status:** Production (deployed to Vercel)
> **Scope:** AI chatbot backend (`ai-backend`), admin dashboard (`ai-admin`), embeddable widget (`ai-widget`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Deployment Architecture](#4-deployment-architecture)
5. [Database Schema](#5-database-schema)
6. [AI Agent Architecture](#6-ai-agent-architecture)
7. [Tool Registry](#7-tool-registry)
8. [RAG Pipeline](#8-rag-pipeline)
9. [LLM Provider Chain](#9-llm-provider-chain)
10. [Human Handoff System](#10-human-handoff-system)
11. [Admin Chat Management](#11-admin-chat-management)
12. [Widget Architecture](#12-widget-architecture)
13. [API Route Map](#13-api-route-map)
14. [Redis Usage Map](#14-redis-usage-map)
15. [BullMQ Worker Jobs](#15-bullmq-worker-jobs)
16. [Tashus Read-Only Adapter](#16-tashus-read-only-adapter)
17. [Token Cost Calculation](#17-token-cost-calculation)
18. [Security Model](#18-security-model)
19. [Environment Variables Reference](#19-environment-variables-reference)
20. [Known Limitations & Future Work](#20-known-limitations--future-work)

---

## 1. Executive Summary

The Tashus AI Chatbot is a production-deployed, multi-component system providing an embeddable chat widget for the Tashus vehicle rental platform. It handles vehicle search, availability checking, voucher validation, policy questions from uploaded PDFs, and live handoff to human support agents.

**Key design principles:**
- **Read-only** against the Tashus production API — no mutations, no bookings, no payments
- **Stateless serverless backend** on Vercel with Redis for shared state across function invocations
- **Streaming-first** — AI responses stream token-by-token via SSE; widget polls for admin messages
- **Graceful degradation** — if LLM providers fail, tool-aware mock returns usable responses
- **Human handoff** — keyword detection OR admin-initiated takeover pauses the AI circuit breaker

---

## 2. Technology Stack

### ai-backend (Next.js API)
| Component | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | 14.2.35 | API routes only — no pages |
| Language | TypeScript | 5.5.3 | Strict mode |
| Primary LLM | Groq (llama-3.3-70b-versatile) | — | 6 API keys rotated via token bucket |
| Fallback LLM | Anthropic Claude | @0.27.0 | Activated only when all Groq keys fail |
| Embeddings | OpenAI text-embedding-3-large | — | Mock provider used when key is dummy |
| Database | Supabase (PostgreSQL + pgvector) | @2.44.4 | AI-only project, not Tashus main DB |
| Cache / Pub-Sub | Redis via ioredis | @5.4.1 | Upstash (TLS `rediss://`) in production |
| Job Queue | BullMQ | @5.8.1 | Requires `maxRetriesPerRequest: null` |
| PDF Parsing | pdf-parse | @1.1.1 | Worker process only |
| Auth (admin) | jose (JWT) | @5.6.3 | HS256, 15min access / 7d refresh |
| Deployment | Vercel (serverless) | — | `tashus-ai-ten.vercel.app` |

### ai-admin (Next.js Dashboard)
| Component | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 14.2.4 |
| UI | Tailwind CSS + custom dark theme | — |
| Auth | argon2 → bcryptjs (production fix) | @3.0.3 |
| Redis client | ioredis | @5.11.1 |
| Icons | lucide-react | @1.24.0 |
| Deployment | Vercel | `tashus-ai-admin.vercel.app` |

### ai-widget (Embeddable Bundle)
| Component | Technology | Version |
|---|---|---|
| Framework | React | 19.2.7 |
| Build tool | Vite | 8.1.1 |
| Language | TypeScript | 6.0.2 |
| CSS | Tailwind CSS | 4.3.2 |
| SSE client | @microsoft/fetch-event-source | @2.0.1 |
| UUID | uuid | @14.0.1 |
| Output | `widget.iife.js` → `ai-backend/public/widget.js` | — |

---

## 3. Repository Structure

```
TashusChatBot/
├── ai-backend/                    # Next.js API server (Vercel)
│   ├── src/
│   │   ├── agent/
│   │   │   ├── orchestrator.ts    # Core chat loop — entry point for all messages
│   │   │   ├── tools.ts           # 6-tool registry + dispatcher
│   │   │   ├── config.ts          # Agent config loader (Redis cache + file prompt)
│   │   │   ├── llm.ts             # Groq/Anthropic provider chain + mock
│   │   │   ├── token-bucket.ts    # Groq key rotation + cooldown tracking
│   │   │   ├── tool-executor.ts   # Input validation before dispatch
│   │   │   ├── fact-checker.ts    # Hallucination detection
│   │   │   └── prompts/
│   │   │       └── system-prompt.md  # Always loaded from file, never DB
│   │   ├── app/api/
│   │   │   ├── ai/
│   │   │   │   ├── chat/stream/    # Main SSE streaming endpoint
│   │   │   │   ├── chat/[sessionId]/history/  # Reload history (force-dynamic)
│   │   │   │   ├── session/        # Create/resume session
│   │   │   │   ├── session/[id]/poll/    # Widget polling (admin msgs + state)
│   │   │   │   ├── session/[id]/stream/  # Session SSE control channel
│   │   │   │   ├── session/[id]/request-handoff/  # User-initiated handoff
│   │   │   │   ├── ingest/         # PDF ingestion trigger
│   │   │   │   ├── health/         # Liveness probe (DB + Redis + TashusAPI)
│   │   │   │   └── token-bucket/status/  # Admin Groq key status dashboard
│   │   │   └── admin/
│   │   │       ├── sessions/       # Session list for admin panel
│   │   │       ├── sessions/[id]/message/   # Admin sends message
│   │   │       ├── sessions/[id]/resume/    # Admin resumes AI
│   │   │       └── notifications/stream/    # Admin SSE for handoff alerts
│   │   ├── rag/
│   │   │   ├── retriever.ts        # Hybrid semantic + keyword search
│   │   │   ├── embedding-provider.ts  # OpenAI/Voyage/Mock providers
│   │   │   ├── chunker.ts          # PDF → text chunks (MAX_CHUNK_CHARS=600)
│   │   │   └── dedup-cache.ts      # Prevents double-retrieval in same turn
│   │   ├── integrations/
│   │   │   └── tashus-adapter/
│   │   │       ├── client.ts       # HTTP client with Redis cache, allow-list
│   │   │       ├── endpoints.ts    # GET-only endpoint implementations
│   │   │       ├── filter-engine.ts # MaskedVehicle field masking
│   │   │       └── types.ts        # TCarDataState, MaskedVehicle types
│   │   ├── workers/
│   │   │   ├── run-workers.ts      # Worker entry point (Koyeb/Railway)
│   │   │   ├── ingest-document.worker.ts  # PDF parse → chunk → embed → store
│   │   │   └── summarize-session.worker.ts  # Rolling conversation summaries
│   │   ├── channels/
│   │   │   ├── process.ts          # Non-streaming message processor (email)
│   │   │   ├── types.ts            # InboundMessageEnvelope
│   │   │   └── email/
│   │   │       ├── sender.ts       # nodemailer SMTP reply
│   │   │       └── parser.ts       # SendGrid/Postmark payload parsing
│   │   ├── db/
│   │   │   └── client.ts           # Supabase singleton + TypeScript types
│   │   └── lib/
│   │       ├── redis.ts            # ioredis singleton, pub/sub, IS_WORKER flag
│   │       ├── queue.ts            # BullMQ queue definitions + enqueue helpers
│   │       ├── env.ts              # Zod env validation (build-phase safe)
│   │       ├── metrics.ts          # In-memory counters
│   │       └── logger.ts           # Structured JSON logger
│   ├── public/
│   │   └── widget.js               # Pre-built widget bundle (committed to git)
│   ├── Dockerfile.worker           # Koyeb worker image
│   ├── vercel.json                 # Route max durations (300s for SSE)
│   └── next.config.js              # serverComponentsExternalPackages
│
├── ai-admin/                      # Admin dashboard (Vercel)
│   └── src/
│       ├── app/(admin)/sessions/page.tsx  # Two-panel inbox UI
│       ├── app/api/admin/sessions/        # Session CRUD + stats
│       ├── app/api/admin/sessions/[id]/
│       │   ├── messages/    # POST admin message
│       │   ├── takeover/    # Activate circuit breaker
│       │   └── release/     # Deactivate circuit breaker
│       ├── lib/
│       │   ├── auth.ts      # bcryptjs + jose JWT + resolveAdmin()
│       │   ├── apiFetch.ts  # Auto-refresh 401 → redirect to login
│       │   └── supabase.ts  # Supabase client + local file store (dev)
│       └── middleware.ts    # JWT validation + token rotation on every request
│
├── ai-widget/                     # Embeddable chat widget (Vite)
│   └── src/
│       ├── components/
│       │   ├── ChatWindow.tsx      # Main chat UI
│       │   ├── MessageBubble.tsx   # Message rendering with role-based styling
│       │   ├── VehicleResultCard.tsx  # Vehicle card renderer
│       │   └── Launcher.tsx        # Floating chat button + unread badge
│       ├── hooks/
│       │   └── useChatStream.ts    # Session init, history, SSE, polling
│       └── lib/
│           ├── sse-client.ts       # Backend HTTP calls + getBackendUrl()
│           └── types.ts            # ChatMessage, StreamEvent interfaces
│
└── DEPLOYMENT_PLAN.md             # Full deployment guide

---

## 4. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  USER BROWSER                                                    │
│  localhost:3000 (Tashus Frontend V1) or tashus.com              │
│                                                                  │
│  <script src="https://tashus-ai-ten.vercel.app/widget.js">      │
│  window.tashusAiConfig = { backendUrl: "https://..." }          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS POST/SSE
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL — ai-backend   tashus-ai-ten.vercel.app                 │
│                                                                  │
│  /api/ai/chat/stream     ← Main SSE stream (300s max)           │
│  /api/ai/session         ← Create/resume session                │
│  /api/ai/session/[id]/poll ← Widget polling every 2s           │
│  /api/ai/health          ← Liveness probe                       │
│  /api/admin/*            ← Proxied by ai-admin                  │
│  GET /widget.js          ← Serves the pre-built widget bundle   │
└────────┬─────────────────────────────────────────┬──────────────┘
         │ Supabase SDK                            │ ioredis TLS
         ▼                                         ▼
┌────────────────────────┐          ┌──────────────────────────────┐
│  SUPABASE              │          │  UPSTASH REDIS               │
│  rdasrmihlrgpthbtoele  │          │  charmed-monitor-168160      │
│                        │          │                              │
│  ai_chat_sessions      │          │  agent-config:active (60s)  │
│  ai_chat_messages      │          │  session:{id}:control (pub) │
│  ai_admin_users        │          │  admin:notifications (pub)   │
│  ai_documents          │          │  ratelimit:* (visitor)       │
│  ai_document_chunks    │          │  tashus-cache:* (API cache)  │
│  ai_knowledge_base     │          │  bull:* (BullMQ queues)      │
│  ai_agent_configs      │          └──────────────────────────────┘
│  ai_tool_call_logs     │
└────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VERCEL — ai-admin    tashus-ai-admin.vercel.app                │
│                                                                  │
│  /sessions              ← Two-panel inbox                       │
│  /documents             ← PDF upload + ingestion                │
│  /knowledge-base        ← KB entry management                   │
│  /api/admin/*           ← Supabase direct (no ai-backend proxy) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  KOYEB / RAILWAY — Worker Process (no public URL)               │
│                                                                  │
│  npm run worker → tsx src/workers/run-workers.ts                │
│  ENV: WORKER_PROCESS=true                                       │
│                                                                  │
│  Listens on BullMQ queues via Redis:                            │
│  • ingest-document  (PDF → chunks → embeddings → Supabase)     │
│  • summarize-session (conversation summary every 6+ messages)  │
└─────────────────────────────────────────────────────────────────┘
```

### Production URLs
| Service | URL |
|---|---|
| AI Backend | `https://tashus-ai-ten.vercel.app` |
| AI Admin | `https://tashus-ai-admin.vercel.app` |
| Widget JS | `https://tashus-ai-ten.vercel.app/widget.js` |
| Health Check | `https://tashus-ai-ten.vercel.app/api/ai/health` |

### Vercel Function Timeouts
| Route | Max Duration |
|---|---|
| `/api/ai/chat/stream` | 300s |
| `/api/ai/session/[id]/stream` | 300s |
| `/api/admin/notifications/stream` | 300s |
| `/api/ai/ingest` | 120s |
| All other routes | 10s (Hobby default) |

---

## 5. Database Schema

All tables live in the `public` schema of the dedicated AI Supabase project (`rdasrmihlrgpthbtoele`). This project is **never** the Tashus main database.

### `ai_chat_sessions`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
visitor_id        text NOT NULL          -- localStorage key from widget
tashus_user_id    uuid                   -- Set if JWT passthrough verified
tashus_user_role  text                   -- 'guest' | 'host'
channel           text DEFAULT 'widget'  -- 'widget' | 'email' | 'voice'
status            text DEFAULT 'active'  -- 'active' | 'handed_off' | 'closed' | 'archived'
is_ai_paused      boolean DEFAULT false  -- Circuit breaker flag
assigned_admin_id uuid                   -- FK to ai_admin_users when human takes over
locale            text DEFAULT 'en'
metadata          jsonb DEFAULT '{}'     -- Arbitrary context (page URL, etc.)
started_at        timestamptz DEFAULT now()
last_message_at   timestamptz DEFAULT now()
closed_at         timestamptz
```

### `ai_chat_messages`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id        uuid NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
role              text NOT NULL  -- 'user' | 'assistant' | 'admin' | 'system' | 'tool'
content           text NOT NULL
tool_calls        jsonb          -- [{name, logId}] for assistant messages
tool_results      jsonb          -- Raw tool responses
sent_by_admin_id  uuid           -- FK to ai_admin_users when role='admin'
tokens_in         int            -- Prompt tokens for this message
tokens_out        int            -- Completion tokens
latency_ms        int            -- Turn latency
created_at        timestamptz DEFAULT now()
```

### `ai_admin_users`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
email           text UNIQUE NOT NULL
password_hash   text NOT NULL          -- bcryptjs, cost=12
display_name    text NOT NULL
role            text DEFAULT 'agent'  -- 'super_admin' | 'admin' | 'agent' | 'viewer'
is_active       boolean DEFAULT true
last_login_at   timestamptz
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `ai_admin_sessions`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
admin_user_id       uuid NOT NULL REFERENCES ai_admin_users(id) ON DELETE CASCADE
refresh_token_hash  text NOT NULL  -- SHA-256 of the refresh JWT
user_agent          text
ip_address          text
expires_at          timestamptz NOT NULL  -- 7 days
created_at          timestamptz DEFAULT now()
```

### `ai_documents`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
title             text NOT NULL
category          text  -- 'rental_policy' | 'insurance' | 'faq_source' | 'terms' | 'general'
original_filename text NOT NULL
storage_path      text NOT NULL  -- Supabase Storage path: {doc_id}/{filename}
mime_type         text DEFAULT 'application/pdf'
file_size_bytes   int
status            text DEFAULT 'pending'  -- 'pending'|'parsing'|'embedding'|'ready'|'failed'
error_message     text
uploaded_by       uuid  -- FK to ai_admin_users
version           int DEFAULT 1
is_active         boolean DEFAULT true
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()
```

### `ai_document_chunks`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
document_id   uuid NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE
chunk_index   int NOT NULL
content       text NOT NULL          -- Max ~600 chars per chunk
page_number   int
token_count   int
embedding     vector(1536)           -- pgvector column, NULL if using mock embeddings
created_at    timestamptz DEFAULT now()
```

### `ai_knowledge_base`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
entry_type  text  -- 'faq' | 'instruction' | 'promotion' | 'override'
question    text  -- Optional Q for FAQ entries
answer      text NOT NULL
tags        text[]
priority    int DEFAULT 0   -- Higher = returned first
embedding   vector(1536)    -- NULL if mock embeddings
is_active   boolean DEFAULT true
starts_at   timestamptz
ends_at     timestamptz
created_by  uuid
updated_by  uuid
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

### `ai_agent_configs`
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
config_key     text UNIQUE NOT NULL  -- 'default'
system_prompt  text NOT NULL         -- Overridden by file at runtime
model          text DEFAULT 'llama-3.3-70b-versatile'
temperature    numeric DEFAULT 0.25
max_tokens     int DEFAULT 1024
enabled_tools  text[]  -- Tool names allowed for this config
is_active      boolean DEFAULT true
updated_by     uuid
updated_at     timestamptz DEFAULT now()
```

### `ai_tool_call_logs`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id        uuid
tool_name         text NOT NULL    -- 'search_vehicles' | '__turn_summary__' | etc.
http_method       text DEFAULT 'GET'
endpoint          text
request_params    jsonb
response_status   int
response_summary  jsonb
cache_hit         boolean DEFAULT false
duration_ms       int
tokens_in         int
tokens_out        int
token_cost_usd    numeric(12, 8)
provider          text             -- 'groq' | 'anthropic' | 'openrouter'
created_at        timestamptz DEFAULT now()
```

---

## 6. AI Agent Architecture

### 6.1 Request Flow (per message)

```
Widget sends message
        │
        ▼
POST /api/ai/chat/stream
  ├─ CORS check (WIDGET_ALLOWED_ORIGINS)
  ├─ Rate limit check (Redis: ratelimit:{visitorId})
  ├─ Session state check (is_ai_paused?)
  │   └─ If paused → relay admin messages, do NOT call orchestrator
  └─ Call processMessageStream(sessionId, text, userContext)
             │
             ▼
        ORCHESTRATOR
        ├─ 1. Insert user message to DB
        ├─ 2. Keyword handoff check (regex before LLM)
        ├─ 3. Load agent config (Redis cache, 60s TTL)
        ├─ 4. intentNeedsRag() classifier
        │      ├─ false → skip RAG (greetings, pure vehicle search)
        │      └─ true  → retrieve() from pgvector / keyword fallback
        ├─ 5. Build system prompt (static + dynamic context)
        ├─ 6. Load conversation history (last 6 messages)
        ├─ 7. LLM loop (max 5 rounds)
        │      ├─ generateCompletionStream()
        │      │   ├─ Try Groq (llama-3.3-70b-versatile) with key rotation
        │      │   ├─ Fallback → Anthropic Claude
        │      │   └─ Last resort → tool-aware mock
        │      ├─ Tool call detected?
        │      │   ├─ validateToolCall() schema check
        │      │   ├─ executeTool() → tashus-adapter (cached)
        │      │   └─ Feed result back into next round
        │      └─ No tool call → stream text to widget
        ├─ 8. Post-process: inject [VEHICLE:...] cards if search_vehicles called
        ├─ 9. Hallucination detection
        ├─ 10. Persist assistant message + token metrics to DB
        ├─ 11. Update session.last_message_at
        └─ 12. Enqueue summarization if >6 messages
```

### 6.2 intentNeedsRag() Classifier

Prevents unnecessary embedding calls for transactional/greeting messages.

| Message type | RAG triggered? | Reason |
|---|---|---|
| "hi", "hello", ≤3 words | ❌ No | Too short |
| "book", "rent", "available", "voucher" | ❌ No | Transactional — tool handles it |
| "I need an SUV in Sydney" | ❌ No | Vehicle type only pattern |
| "can I smoke in the car?" | ✅ Yes | Policy keyword match |
| "what happens if I lose the vehicle?" | ✅ Yes | Policy keyword: `lost`, `what happens` |
| "what is the cancellation policy?" | ✅ Yes | Policy keyword: `cancellation`, `what is` |
| Any other 4+ word question | ✅ Yes | Default |

### 6.3 System Prompt Loading

The system prompt is **always loaded from the file** `src/agent/prompts/system-prompt.md`. The DB version is never used for the prompt — only for model/temperature/tools config. This ensures code changes take effect immediately without a DB update.

```
loadActiveAgentConfig():
  1. Read system-prompt.md from filesystem
  2. Check Redis cache (agent-config:active, TTL 60s)
     └─ Found: return { ...cached, system_prompt: filePrompt }
     └─ Not found: query ai_agent_configs table
         └─ Not found: use hardcoded fallback defaults
  3. Cache result in Redis for 60s
```

### 6.4 Conversation Memory (Rolling Window)

- Last **6 messages** loaded per turn (3 user + 3 assistant)
- Messages older than 6 are summarized by the `summarize-session` BullMQ worker
- Summary stored in `ai_chat_sessions.metadata.conversation_summary`
- Summary injected into dynamic context on every turn when present
- `admin` role messages are mapped to `assistant` role for LLM context (so AI knows what the human agent said)
- `system` and `tool` messages are excluded from LLM context

---

## 7. Tool Registry

All tools are **read-only**. No tool creates, modifies, or deletes any Tashus data.

### Tool 1: `search_vehicles`
- **Purpose:** Search live Tashus inventory by location, date range, and optional filters
- **Default city:** Sydney (never asks user unless they mention another city)
- **Default dates:** Tomorrow 9am → day after tomorrow 9am (user's local timezone)
- **Returns:** `MaskedVehicle[]` — filtered, privacy-safe vehicle list

| Parameter | Type | Required | Description |
|---|---|---|---|
| `city` | string | ❌ | Default: "Sydney" |
| `from` | datetime ISO8601 | ✅ | Pickup time (UTC) |
| `to` | datetime ISO8601 | ✅ | Return time (UTC) |
| `cType` | enum | ❌ | SUV, Sedan, Hatchback, Ute, Van, Convertible, Coupe, Wagon |
| `tType` | enum | ❌ | Automatic, Manual |
| `fType` | enum | ❌ | Petrol, Diesel, Electric, Hybrid |
| `minSeats` | number | ❌ | Floor limit — `minSeats=5` returns 5, 7, 8-seaters |
| `maxPrice` | number | ❌ | Daily rate ceiling in AUD |

**Response shape (MaskedVehicle):**
```json
{
  "total_matching": 5,
  "total_raw": 12,
  "shown": [
    {
      "listingId": 1004,
      "displayName": "TOYOTA Hiace",
      "carType": "SUV",
      "seats": 5,
      "transmission": "Automatic",
      "fuelType": "Petrol",
      "dailyRate": 50,
      "hourlyRate": 5,
      "location": { "city": "Sydney", "state": "New South Wales" },
      "coverPhotoUrl": "https://res.cloudinary.com/...",
      "hostRating": 4.6
    }
  ],
  "filters_applied": { "vehicleType": "SUV" }
}
```

**Post-processing in orchestrator:** When `shown.length > 0`, the orchestrator replaces the LLM's plain-text response with a structured context line + `[VEHICLE: {...}]` card tags. The widget's `MessageBubble` parses these tags and renders `VehicleResultCard` components.

### Tool 2: `get_vehicle_details`
- **Purpose:** Full specs, host info, features, guidelines for a specific listing
- **Returns:** `MaskedVehicleDetails` — complete detail object

| Parameter | Type | Required |
|---|---|---|
| `listingId` | number | ✅ |

### Tool 3: `check_availability`
- **Purpose:** Block-date calendar for a specific vehicle
- **Returns:** Array of blocked date ranges

| Parameter | Type | Required |
|---|---|---|
| `carListingId` | number | ✅ |

### Tool 4: `validate_voucher`
- **Purpose:** Look up voucher eligibility, terms, discount amount
- **Read-only** — never applies or redeems
- **Returns:** Voucher details including discount, expiry, usage limits

| Parameter | Type | Required |
|---|---|---|
| `voucherSlug` | string | ✅ |

### Tool 5: `search_knowledge_base`
- **Purpose:** Semantic search across uploaded PDF documents and manual KB entries
- **Triggers for:** Policy questions, rule questions, "what happens if...", fee questions
- **Never for:** Vehicle search, booking, voucher queries

| Parameter | Type | Required |
|---|---|---|
| `query` | string | ✅ |

**RAG dedup:** If `intentNeedsRag()` already ran retrieval for the same query this turn, the cached result is returned without a second embedding call (~2,000 tokens saved).

### Tool 6: `escalate_to_human`
- **Purpose:** Activate circuit breaker + notify admin panel immediately
- **Two activation paths:**
  1. **Keyword detection** (pre-LLM): orchestrator regex matches "human", "speak to", "live agent", etc. → bypasses LLM entirely
  2. **Tool call** (post-LLM): LLM calls this tool when it determines escalation is needed

| Parameter | Type | Required |
|---|---|---|
| `reason` | string | ❌ |

**On activation:**
1. Sets `is_ai_paused=true`, `status='handed_off'` in `ai_chat_sessions`
2. Inserts system message: `"🤝 Connecting you to a human agent..."`
3. Publishes to Redis `session:{id}:control` channel (widget receives via poll)
4. Publishes to Redis `admin:notifications` channel (admin panel receives via SSE)

---

## 8. RAG Pipeline

### 8.1 Document Ingestion (from Admin Panel or localhost)

```
Upload PDF via /api/admin/documents (POST)
  │
  ├─ Insert ai_documents record (status='pending')
  ├─ Upload file to Supabase Storage (bucket: ai-documents)
  ├─ Update storage_path in DB
  └─ Call POST /api/ai/ingest with documentId
       │
       ├─ INLINE path (within Vercel function, 120s limit):
       │   ├─ pdf-parse → text
       │   ├─ Chunker → ~600 char chunks with overlap
       │   ├─ EmbeddingProvider.embed(chunks[]) → float[][]
       │   ├─ Bulk insert to ai_document_chunks with embedding vectors
       │   └─ Update ai_documents.status = 'ready'
       │
       └─ QUEUED path (fallback if inline times out):
           └─ BullMQ: enqueue to ingest-document queue
               └─ Worker picks up → same process above
```

### 8.2 Retrieval at Query Time

```
retrieve(query: string):
  ├─ Generate query embedding (EmbeddingProvider)
  │   ├─ Real key → OpenAI text-embedding-3-large (1536-dim)
  │   └─ Dummy/missing key → MockEmbeddingProvider (deterministic hash-based)
  │
  ├─ Search ai_knowledge_base (pgvector cosine similarity, threshold 0.75)
  │   └─ Returns [AUTHORITATIVE] tagged KB entries first
  │
  ├─ Search ai_document_chunks (pgvector, threshold 0.65)
  │   └─ Returns [SOURCE: filename, p.N] tagged chunks
  │
  ├─ If embedding fails → keyword fallback (SQL ILIKE scan)
  │   NOTE: This is 5-7x slower — fix by providing real EMBEDDING_PROVIDER_API_KEY
  │
  ├─ Merge results, cap at MAX_CONTEXT_TOKENS=2000
  └─ Return { context: string, sources: RetrievalSource[] }
```

### 8.3 Embedding Provider Selection

```typescript
getEmbeddingProvider():
  isDummyKey = key is missing | starts with 'sk-dummy' | length < 20
  
  if (isDummyKey):
    → MockEmbeddingProvider (works in dev AND production)
    → Deterministic hash-based vectors, instant, no API call
    → Semantic similarity is approximate but consistent
  
  if (provider === 'voyage'):
    → VoyageEmbeddingProvider (voyage-large-2)
  
  else (default 'openai'):
    → OpenAIEmbeddingProvider (text-embedding-3-large, 1536-dim)
    → 3 retries with exponential backoff
```

**Important:** Using mock embeddings means vectors stored in `ai_document_chunks` were generated with the mock algorithm. If you later switch to a real OpenAI key, all chunks must be re-embedded (re-ingest all documents) for semantic search to work correctly.

---

## 9. LLM Provider Chain

### 9.1 Provider Hierarchy

```
generateCompletionStream():
  ├─ Both providers mock? → tool-aware mock (development only)
  │
  ├─ streamWithFallback([groqFn, anthropicFn]):
  │   ├─ TRY: Groq (llama-3.3-70b-versatile)
  │   │   └─ Token bucket rotation across 6+ API keys
  │   │       ├─ 429 rate limit → cooldown 65s, try next key
  │   │       ├─ All keys cooldown → throw 'All Groq keys in cooldown'
  │   │       └─ Success → yield tokens
  │   │
  │   └─ FALLBACK: Anthropic Claude
  │       └─ Uses ANTHROPIC_API_KEY
  │
  └─ LAST RESORT: tool-aware mock (if all providers exhausted)
```

### 9.2 Groq Token Bucket

- **Model:** `llama-3.3-70b-versatile` (hardcoded — ignores `config.model` in Groq path)
- **Keys:** Up to 7 keys supported, comma-separated in `GROK_API_KEYS`
- **Cooldown on 429:** 65 seconds per key
- **Cooldown on 5xx:** Short backoff
- **Status endpoint:** `GET /api/ai/token-bucket/status`
- **Key rotation:** Round-robin starting from next available key each request

### 9.3 Tool-Aware Mock (Fallback of Last Resort)

When all real providers fail, the mock handles 3 cases:

| Case | Detection | Response |
|---|---|---|
| **A — Vehicle search result** | Tool result parses as `{total_matching, shown:[]}` | Renders `[VEHICLE:...]` tags |
| **B — Vehicle detail result** | Tool result has `listingId` + `car` fields | Renders formatted vehicle specs |
| **C — Knowledge base result** | Content contains `[AUTHORITATIVE` or `[SOURCE:` tags | Strips tags, returns "Based on Tashus policy: ..." |
| **First round — KB question** | `kbPattern` regex matches | Calls `search_knowledge_base` tool |
| **First round — vehicle search** | Explicit search intent words | Calls `search_vehicles` tool |
| **First round — details** | 4-digit ID + "detail/about/info" keywords | Calls `get_vehicle_details` tool |

---

## 10. Human Handoff System

### 10.1 Circuit Breaker State Machine

```
ACTIVE (is_ai_paused=false)
    │
    ├─ User says "I need human support" (keyword regex)
    │   → Orchestrator pre-LLM detection → HANDOFF
    │
    ├─ LLM calls escalate_to_human tool
    │   → Orchestrator tool result handler → HANDOFF
    │
    └─ Admin clicks "Take Over" button
        → POST /api/admin/sessions/[id]/takeover → HANDOFF

HANDOFF (is_ai_paused=true, status='handed_off')
    │
    ├─ User messages are still saved to DB (admin sees them)
    ├─ Orchestrator skips LLM entirely — no AI response
    ├─ Widget polls /api/ai/session/[id]/poll every 2s
    │   └─ Returns new admin + system messages since last timestamp
    │
    └─ Admin clicks "Resume AI"
        → POST /api/admin/sessions/[id]/release

ACTIVE (is_ai_paused=false, assigned_admin_id=null)
    └─ AI resumes, system message inserted: "AI has resumed"
```

### 10.2 Keyword Detection Regex

Pre-LLM check in `processMessageStream()`:
```
/\b(human|agent|person|representative|rep|staff|real person|live agent|
live support|live chat|live help|speak to|talk to|connect me|connect with|
escalate|handoff|hand off|transfer me|human (support|assistance|help)|
need (human|real|live) (help|support|agent|person)|
i want (a |an )?(human|agent|person|support)|
(can i|i want to) (speak|talk) (to|with) (a |an )?(human|person|agent)|
human assist)\b/i
```

### 10.3 Redis Pub/Sub Channels

| Channel | Publisher | Subscriber | Payload |
|---|---|---|---|
| `session:{id}:control` | Orchestrator, admin routes | Widget SSE stream | `{type:'control', paused:bool, message:{...}}` |
| `session:{id}:control` | Admin messages route | Widget 2s poll | `{type:'message', message:{id,role,content,...}}` |
| `admin:notifications` | Orchestrator (handoff) | Admin panel SSE | `{type:'handoff_requested', session_id, visitor_id}` |

---

## 11. Admin Chat Management

### 11.1 Two-Panel Layout

```
┌────────────────────┬────────────────────────────────────────────┐
│ LEFT PANEL (280px) │ RIGHT PANEL (flex-1)                        │
│ bg: #0F161E        │ bg: #090D11                                  │
│                    │                                              │
│ [Active: N]        │ If no session selected:                     │
│ [Handoff: N] 🟠    │   "Select a conversation"                   │
│                    │                                              │
│ [All] [Handoff 🔴] │ If session selected (InlineChatPanel):      │
│                    │   Header: visitor_id + status badge          │
│ [Search input]     │   [● Handoff Mode] or [● AI Active]          │
│                    │   [Take Over] or [▶ Resume AI] + [Close]    │
│ SessionCard        │                                              │
│  • visitor_id      │   Message thread:                           │
│  • last message    │   user → right, teal bg                     │
│  • orange dot if   │   assistant → left, "AI" label              │
│    handoff         │   admin → left, orange, admin name          │
│                    │   system → centered, muted                  │
│ ...                │                                              │
│                    │   Composer (only when is_ai_paused=true):   │
│                    │   [textarea] [Send]  Enter=send             │
└────────────────────┴────────────────────────────────────────────┘
```

### 11.2 Admin API Routes (ai-admin)

| Route | Method | Auth | Action |
|---|---|---|---|
| `/api/admin/sessions` | GET | JWT | List sessions with stats, handoff filter |
| `/api/admin/sessions/[id]` | GET | JWT | Full session + messages + admin names |
| `/api/admin/sessions/[id]` | PATCH | JWT | Close session (status='closed') |
| `/api/admin/sessions/[id]/takeover` | POST | JWT | Set is_ai_paused=true, assign admin |
| `/api/admin/sessions/[id]/messages` | POST | JWT | Send admin message, publish to Redis |
| `/api/admin/sessions/[id]/release` | POST | JWT | Set is_ai_paused=false, clear assignment |
| `/api/admin/notifications/stream` | GET | JWT | SSE: handoff alerts from Redis |

**Dev mode bypass:** When `NODE_ENV !== 'production'`, `resolveAdmin()` returns a hardcoded `Dev Admin` identity without requiring a JWT cookie. This is automatically disabled on Vercel (production).

### 11.3 Auto-Refresh Strategy

| Trigger | Method | Frequency |
|---|---|---|
| Tab change or search | Full `fetchSessions()` | On demand |
| SSE `handoff_requested` | Silent `fetchSessions(true)` | Instant |
| Auto-poll | `fetchSessions(true)` | Every 10s |
| After admin action | `fetchSessions(true)` | After each action |
| InlineChatPanel | `fetchDetail()` | Every 3s |

---

## 12. Widget Architecture

### 12.1 Session Lifecycle

```
Widget mounts
  │
  ├─ Read visitor_id from localStorage (tashus_ai_visitor_id)
  │   └─ Not found: generate visitor_${uuid4}, save
  │
  ├─ Read session_id from localStorage (tashus_ai_session_id)
  │   └─ Found: use existing session
  │   └─ Not found: POST /api/ai/session → new session_id, save
  │
  ├─ GET /api/ai/chat/{session_id}/history
  │   └─ Returns all messages except 'tool' role
  │   └─ Seeds seenMessageIds set for polling dedup
  │   └─ Sets lastAdminMsgAt timestamp (latest message - 1ms)
  │   └─ Restores is_ai_paused state from last system/admin messages
  │
  └─ Start 2s polling loop: GET /api/ai/session/{id}/poll?since={ts}
      └─ Returns admin + system messages since timestamp
      └─ Syncs is_ai_paused state
      └─ Deduplicates via seenMessageIds Set
```

### 12.2 Message Sending (SSE Stream)

```
User sends message
  │
  ├─ Append user bubble immediately (optimistic UI)
  ├─ Append empty assistant bubble (streaming: true)
  │
  └─ POST /api/ai/chat/stream via fetchEventSource
      │
      ├─ event: meta → { sessionId }
      ├─ event: tool_start → show "Checking X..." chip
      ├─ event: tool_result → remove tool chip
      ├─ event: token → accumulate text in assistant bubble
      ├─ event: paused → show handoff banner, stop streaming
      ├─ event: done → finalize assistant message content
      └─ event: error → show error state
```

### 12.3 Vehicle Card Rendering

When the widget receives a `token` event containing `[VEHICLE: {...}]` tags, `MessageBubble` parses them with a regex and renders `VehicleResultCard` components inline:

```
Token text: "Here are some SUVs in Sydney available tomorrow:\n\n[VEHICLE: {...}] [VEHICLE: {...}]"

Parsed into:
  - Text part: "Here are some SUVs in Sydney available tomorrow:"
  - VehicleResultCard × N (fixed height: 220px each)
  - "View More" card if total_matching > 10
  - Follow-up text: "Would you like to know more about any of these?"
```

Each card has:
- Vehicle photo (fixed 90px height)
- Price badge (bottom-right overlay)
- Name (2-line clamp)
- Spec pills (category, seats, transmission)
- Location + host rating
- "View Details →" CTA button

### 12.4 Backend URL Resolution

```typescript
getBackendUrl():
  1. window.tashusAiConfig?.backendUrl   ← Set by AIWidgetLoader before script load
  2. __AI_BACKEND_URL__                  ← Baked in at Vite build time (VITE_AI_BACKEND_URL)
  3. 'http://localhost:3001'             ← Development fallback
```

The `AIWidgetLoader` React component in `Tashus_Frontend_V1` sets `window.tashusAiConfig.backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL` before appending the `<script>` tag.

---

## 13. API Route Map

### ai-backend Routes

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/api/ai/session` | POST | None | Create or resume session by visitor_id |
| `/api/ai/chat/stream` | POST | None | Main SSE stream — orchestrator entry |
| `/api/ai/chat/[sessionId]/history` | GET | None | Load full message history (force-dynamic) |
| `/api/ai/session/[id]/poll` | GET | None | Poll for admin/system messages since timestamp |
| `/api/ai/session/[id]/stream` | GET | None | Redis pub/sub SSE (legacy — widget uses poll) |
| `/api/ai/session/[id]/request-handoff` | POST | None | User-initiated handoff request |
| `/api/ai/ingest` | POST | Internal | Trigger PDF document ingestion |
| `/api/ai/health` | GET | None | Liveness probe: DB + Redis + TashusAPI |
| `/api/ai/token-bucket/status` | GET | None | Groq key status |
| `/api/ai/verify-tashus-token` | POST | None | JWT passthrough verification |
| `/api/admin/sessions` | GET | JWT cookie | List sessions for admin panel (ai-backend parallel) |
| `/api/admin/sessions/[id]/message` | POST | JWT cookie | Relay admin message (ai-backend parallel) |
| `/api/admin/sessions/[id]/resume` | POST | JWT cookie | Resume AI (ai-backend parallel) |
| `/api/admin/notifications/stream` | GET | JWT cookie | SSE: Redis admin notifications |

### ai-admin Routes

| Path | Purpose |
|---|---|
| `/login` | Admin login page |
| `/sessions` | Two-panel session inbox |
| `/documents` | PDF upload + ingestion management |
| `/knowledge-base` | Manual KB entry management |
| `/config` | Agent model/temperature config |
| `/analytics` | Token usage + response metrics |
| `/token-bucket` | Groq API key health dashboard |

---

## 14. Redis Usage Map

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `agent-config:active` | String (JSON) | 60s | Agent config cache |
| `tashus-cache:*` | String (JSON) | 60-120s | Tashus API response cache |
| `ratelimit:{visitorId}` | String | 60s | Per-visitor rate limit counter |
| `session:{id}:control` | Pub/Sub channel | — | Widget SSE + admin message relay |
| `admin:notifications` | Pub/Sub channel | — | Admin panel SSE notifications |
| `bull:ingest-document:*` | BullMQ | Varies | PDF ingestion job queue |
| `bull:summarize-session:*` | BullMQ | Varies | Session summarization queue |

**Tashus API Cache TTLs:**
| Endpoint | TTL |
|---|---|
| `/search/find-cars` | 60s |
| `/search/find-cars/:listingId` | 90s |
| `/reservation/block-dates-by-car/:id` | 60s |
| `/voucher/get-common-vouchers` | 120s |
| `/v2/voucher/slug/:slug` | 120s |
| `/search/vehicle-delivery-price/:km` | 60s |

---

## 15. BullMQ Worker Jobs

### Job: `ingest-document`
- **Trigger:** `POST /api/ai/ingest` after PDF upload
- **Concurrency:** 2
- **Retries:** 3 (exponential: 2s, 4s, 8s)
- **Steps:**
  1. Fetch document record from `ai_documents`
  2. Download PDF from Supabase Storage
  3. `pdf-parse` → raw text
  4. `chunker.ts` → ~600 char chunks with sentence boundary detection
  5. `EmbeddingProvider.embed(chunks)` → float[][] (batch of 128)
  6. Bulk insert to `ai_document_chunks` with embedding vectors
  7. Update `ai_documents.status = 'ready'`

### Job: `summarize-session`
- **Trigger:** Orchestrator enqueues when message count > 6
- **Concurrency:** 2
- **Retries:** 2
- **Priority:** 10 (low — background)
- **Dedup:** One job per session at a time (`jobId: summarize-{sessionId}`)
- **Steps:**
  1. Fetch last N messages from session
  2. Call LLM with summarization prompt
  3. Store result in `ai_chat_sessions.metadata.conversation_summary`

### Worker Process
```
WORKER_PROCESS=true npm run worker
→ tsx src/workers/run-workers.ts
→ Starts ingest + summarize workers
→ Connects to Redis (maxRetriesPerRequest=null, lazyConnect=false)
→ Handles SIGTERM/SIGINT gracefully
```

---

## 16. Tashus Read-Only Adapter

The adapter enforces a strict read-only contract with the Tashus production API. All requests go through `tashus-adapter/client.ts`:

```typescript
// Allow-list enforcement — only these endpoints can be called
const ALLOWED_ENDPOINTS = new Set([
  '/search/find-cars',
  '/search/find-cars/:listingId',
  '/reservation/block-dates-by-car/:carListingId',
  '/voucher/get-common-vouchers',
  '/v2/voucher/slug/:voucherSlug',
  '/search/vehicle-delivery-price/:drivingDistanceInKm',
]);

// GET only — no POST, PUT, DELETE, PATCH
// Redis cache checked before every HTTP call
// ai_tool_call_logs written after every call
```

**Vehicle data masking:** Raw `TCarDataState` objects are filtered through `maskVehicleDetails()` which returns only the fields safe to expose to the LLM:
- ✅ Exposed: `listingId`, `displayName`, `carType`, `seats`, `transmission`, `fuelType`, `dailyRate`, `hourlyRate`, `location`, `coverPhotoUrl`, `hostRating`
- ❌ Hidden: Host personal info (last name, contact details), exact GPS coordinates, financial details, internal IDs

---

## 17. Token Cost Calculation

### 17.1 LLM Pricing (Current Providers)

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|---|
| **Groq** | llama-3.3-70b-versatile | $0.59 | $0.79 |
| **Anthropic** | claude-3-5-sonnet | $3.00 | $15.00 |
| **OpenAI** | text-embedding-3-large | $0.13 | — |

**Primary path is always Groq** — Anthropic is only activated when all Groq keys are rate-limited simultaneously.

### 17.2 Token Budget Per Turn

Each turn injects into the LLM context:

| Component | Approx Tokens | Notes |
|---|---|---|
| Static system prompt | ~1,200 | Loaded from file, Groq prefix-cached at 50% cost |
| DateTime context block | ~80 | User timezone + tomorrow's date |
| Conversation history (6 msgs) | ~300–600 | Last 3 user + 3 assistant messages |
| Conversation summary | ~0–200 | Only when session > 6 messages |
| RAG context (when retrieved) | ~500–2,000 | Policy/FAQ content, capped at 2,000 tokens |
| Tool schemas (5 tools) | ~800 | Sent with every non-final round |
| User message | ~10–50 | Typical short question |
| **Total input (typical)** | **~2,500–4,500** | |
| **Assistant response** | **~50–200** | Short answers + vehicle tags |

### 17.3 Scenario Cost Analysis

#### Scenario A: Simple Greeting ("hi")
```
Turn type: Greeting (no RAG, no tool)
Rounds: 1
Input tokens:  ~2,500 (system + history + user)
Output tokens: ~50
Cost (Groq):   (2500 × $0.59 + 50 × $0.79) / 1,000,000 = $0.0000186
Cost per 1,000 greetings: ~$0.019
```

#### Scenario B: Vehicle Search ("I need an SUV under $60 in Sydney")
```
Turn type: search_vehicles tool call (no RAG, 2 rounds)
Round 1: LLM calls search_vehicles tool
  Input:  ~3,200 (system + history + user + tool schemas)
  Output: ~30 (tool call JSON)

Round 2: LLM formats response with vehicle cards
  Input:  ~3,200 + ~400 (tool result) = ~3,600
  Output: ~60 (context line + follow-up text)

Total input:  ~6,800 tokens
Total output: ~90 tokens
Cost (Groq):  (6800 × $0.59 + 90 × $0.79) / 1,000,000 = $0.0000472
Cost per 1,000 vehicle searches: ~$0.047
```

#### Scenario C: Knowledge Base Question ("can I smoke in the car?")
```
Turn type: RAG + search_knowledge_base tool (2 rounds)
RAG pre-retrieval: ~1,500 tokens injected as dynamic context
Round 1: LLM calls search_knowledge_base (or uses RAG context directly)
  Input:  ~2,500 + 1,500 (RAG) + 800 (tools) = ~4,800
  Output: ~30 (tool call)

Round 2: LLM formats policy answer
  Input:  ~4,800 + ~800 (KB result) = ~5,600
  Output: ~150 (clear policy answer)

Total input:  ~10,400 tokens
Total output: ~180 tokens
Cost (Groq):  (10400 × $0.59 + 180 × $0.79) / 1,000,000 = $0.0000755
Cost per 1,000 policy questions: ~$0.076
```

#### Scenario D: Vehicle Details + Follow-up ("tell me more about the Toyota")
```
Turn type: get_vehicle_details tool (2 rounds)
Round 1: LLM calls get_vehicle_details
  Input:  ~3,500
  Output: ~25

Round 2: LLM formats structured vehicle summary
  Input:  ~3,500 + ~1,200 (detailed vehicle JSON) = ~4,700
  Output: ~300 (full spec table + CTA)

Total input:  ~8,200 tokens
Total output: ~325 tokens
Cost (Groq):  (8200 × $0.59 + 325 × $0.79) / 1,000,000 = $0.0000741
Cost per 1,000 detail lookups: ~$0.074
```

#### Scenario E: Full Conversation (10 turns, mixed queries)
```
Typical 10-turn conversation:
  - 3 greetings/simple questions: 3 × $0.0000186 = $0.0000558
  - 4 vehicle searches:           4 × $0.0000472 = $0.0001888
  - 2 policy questions:           2 × $0.0000755 = $0.0001510
  - 1 vehicle detail:             1 × $0.0000741 = $0.0000741

Total per conversation: ~$0.0004697 (~$0.0005)
Cost per 1,000 conversations: ~$0.47
Cost per 10,000 conversations: ~$4.70
```

#### Scenario F: Anthropic Fallback (all Groq keys exhausted)
```
Same Scenario B but on Anthropic claude-3-5-sonnet:
Input:  ~6,800 tokens × $3.00/1M   = $0.0000204
Output: ~90 tokens   × $15.00/1M  = $0.00000135
Total: ~$0.0000218 per turn

NOTE: Anthropic is actually cheaper per turn than Groq for typical
short conversations because Groq charges more per output token.
Groq is preferred for throughput/speed and free-tier key rotation.
```

### 17.4 Monthly Cost Projections

| Daily Active Users | Conversations/Day | Turns/Conv | Monthly Groq Cost | Monthly Anthropic (fallback) |
|---|---|---|---|---|
| 100 | 100 | 10 | ~$1.41 | ~$0.65 |
| 500 | 500 | 10 | ~$7.05 | ~$3.27 |
| 1,000 | 1,000 | 10 | ~$14.10 | ~$6.54 |
| 5,000 | 5,000 | 10 | ~$70.50 | ~$32.70 |

**Note:** Groq free tier provides ~14,400 requests/day per key × 6 keys = ~86,400 requests/day before costs. For typical usage under 86,400 daily turns, Groq is effectively **$0/month**.

### 17.5 Token Tracking in Production

Every turn records to `ai_tool_call_logs` with `tool_name='__turn_summary__'`:
- `tokens_in` — total prompt tokens
- `tokens_out` — completion tokens
- `token_cost_usd` — calculated cost
- `provider` — 'groq' | 'anthropic' | 'openrouter'

Query for daily cost:
```sql
SELECT
  DATE(created_at) as date,
  provider,
  SUM(tokens_in) as total_input_tokens,
  SUM(tokens_out) as total_output_tokens,
  SUM(token_cost_usd) as total_cost_usd
FROM ai_tool_call_logs
WHERE tool_name = '__turn_summary__'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date DESC;
```

---

## 18. Security Model

### 18.1 Widget (Public-Facing)
- **No authentication** — widget is fully public
- **CORS** — controlled by `WIDGET_ALLOWED_ORIGINS` env var (`*` in dev, explicit origins in production)
- **Rate limiting** — per `visitor_id`, configurable in `src/agent/token-bucket.ts`
- **Read-only** — no mutations possible through widget API
- **No secrets** — widget bundle contains only the backend URL (public)

### 18.2 Admin Panel
- **JWT authentication** — HS256 signed with `JWT_SIGNING_SECRET_ADMIN`
- **Access token** — 15 minutes, httpOnly cookie
- **Refresh token** — 7 days, httpOnly cookie, SHA-256 hash stored in `ai_admin_sessions`
- **Token rotation** — middleware auto-refreshes on every request using refresh token
- **Dev bypass** — `resolveAdmin()` returns `Dev Admin` when `NODE_ENV !== 'production'`
- **Password hashing** — bcryptjs with cost=12 (replaced argon2 for Vercel serverless compatibility)
- **Auto-logout on 401** — `apiFetch()` wrapper redirects to `/login?from=<path>` when refresh fails

### 18.3 AI Backend (API Routes)
- **No public auth** on widget routes — rate limiting only
- **JWT auth** on `/api/admin/*` routes — same JWT secret as ai-admin
- **Supabase service role** — server-side only, never exposed to browser
- **Tashus adapter** — GET-only, allow-listed endpoints, no user credentials passed

### 18.4 Secrets Inventory
| Secret | Used by | Where stored |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ai-backend, ai-admin | Vercel env vars |
| `GROK_API_KEYS` (6 keys) | ai-backend | Vercel env vars |
| `JWT_SIGNING_SECRET_ADMIN` | ai-backend, ai-admin | Vercel env vars (must match) |
| `REDIS_URL` (Upstash TLS) | ai-backend, ai-admin, worker | Vercel + Koyeb env vars |
| `ANTHROPIC_API_KEY` | ai-backend (fallback) | Vercel env vars |
| `EMBEDDING_PROVIDER_API_KEY` | ai-backend, worker | Vercel env vars |

---

## 19. Environment Variables Reference

### ai-backend (Vercel)
| Variable | Required | Example | Notes |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | `https://xxx.supabase.co` | AI-only project |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | `eyJhbGci...` | Min 100 chars |
| `REDIS_URL` | ✅ | `rediss://default:...@...upstash.io:6379` | Must be `rediss://` for Upstash TLS |
| `GROK_API_KEYS` | ✅ | `gsk_xxx,gsk_yyy,...` | Comma-separated, up to 7 keys |
| `GROK_API_BASE_URL` | ✅ | `https://api.groq.com/openai` | |
| `JWT_SIGNING_SECRET_ADMIN` | ✅ | 32+ char random string | Must match ai-admin |
| `TASHUS_API_BASE_URL` | ✅ | `https://api.tashus.com/api` | |
| `EMBEDDING_PROVIDER` | ✅ | `openai` | `openai` or `voyage` |
| `EMBEDDING_PROVIDER_API_KEY` | ✅ | `sk-...` or `sk-dummy-...` | Dummy key → mock embeddings |
| `EMBEDDING_MODEL` | ✅ | `text-embedding-3-large` | |
| `EMBEDDING_DIMENSION` | ✅ | `1536` | Must match pgvector column |
| `WIDGET_ALLOWED_ORIGINS` | ✅ | `https://tashus.com,http://localhost:3000` | CORS whitelist |
| `ANTHROPIC_API_KEY` | ❌ | `sk-ant-api03-...` | Optional fallback |
| `NODE_ENV` | ✅ | `production` | Enables JWT auth, disables dev bypass |

### ai-admin (Vercel)
| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_AI_BACKEND_URL` | ✅ | Browser-facing backend URL |
| `AI_BACKEND_URL` | ✅ | Server-side backend URL (token-bucket, ingest) |
| `SUPABASE_URL` | ✅ | Same as ai-backend |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Same as ai-backend |
| `REDIS_URL` | ✅ | Same as ai-backend |
| `JWT_SIGNING_SECRET_ADMIN` | ✅ | **Must be identical** to ai-backend |
| `EMBEDDING_PROVIDER` | ✅ | Same as ai-backend |
| `EMBEDDING_PROVIDER_API_KEY` | ✅ | Same as ai-backend |
| `EMBEDDING_MODEL` | ✅ | Same as ai-backend |
| `EMBEDDING_DIMENSION` | ✅ | Same as ai-backend |
| `NODE_ENV` | ✅ | `production` |

### Worker Process (Koyeb/Railway)
All of ai-backend vars plus:
| Variable | Value |
|---|---|
| `WORKER_PROCESS` | `true` — enables BullMQ-compatible Redis config (`maxRetriesPerRequest: null`) |

### ai-widget Build
| Variable | Notes |
|---|---|
| `VITE_AI_BACKEND_URL` | Baked into bundle at build time. Production: `https://tashus-ai-ten.vercel.app` |

---

## 20. Known Limitations & Future Work

### Current Limitations

| Limitation | Impact | Workaround |
|---|---|---|
| Mock embeddings in production (dummy API key) | KB search uses keyword fallback (slower, less accurate) | Provide real `EMBEDDING_PROVIDER_API_KEY` |
| Vercel Hobby 10s function timeout | Long LLM responses may cut off | Fluid Compute enabled (300s max) |
| No persistent SSE (Vercel serverless) | Widget polls every 2s for admin messages | Acceptable for chat UX |
| Groq rate limits (429) at high traffic | Falls back to Anthropic or mock | 6 keys + token bucket rotation |
| Session summarization is best-effort | Long sessions may lose context | BullMQ queue with retry |
| No real-time WebSocket | Admin panel polls every 3s for message updates | Acceptable for admin UX |
| PDF ingestion limit 20MB | Large policy documents may need splitting | Admin UI enforces 20MB |

### Planned Enhancements (V4.0)

| Feature | Description |
|---|---|
| **Canned responses** | Admin pre-saved replies, `ai_canned_responses` table exists, UI pending |
| **Session tags** | Categorize sessions (billing, booking, technical), `ai_session_tags` table exists |
| **Advanced analytics** | Response time metrics, resolution rate, handoff rate by time |
| **Real OpenAI embeddings** | Better semantic search quality — just set real key |
| **Multi-channel** | Email channel partially implemented (`/api/ai/channels/email/webhook`) |
| **Team collaboration** | Session transfer between admins |
| **Proactive messages** | Trigger widget messages based on user page behavior |

---

*Blueprint version 3.2.0 — Last updated 2026-08-03*
*Verified against codebase: ai-backend v3.1.0, ai-admin v2.0, ai-widget v0.0.0*
