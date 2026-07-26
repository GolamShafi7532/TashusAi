# Tashus AI Ecosystem — Complete Project Blueprint

> **Purpose:** Comprehensive architectural context anchor for AI agents and engineers.
> **Scope:** Vehicle search, live availability, reservations, vouchers, promotions, and AI chatbot orchestration.
> **Source:** Static + dynamic analysis of `Tashus_Frontend_V1` and `TashusChatBot` (ai-backend, ai-admin, ai-widget) codebases.
> **Generated:** 2026-07-13

---

## Executive Summary

This blueprint maps the complete data flow, API contracts, and backend service logic for the Tashus vehicle rental platform's AI integration layer. It documents:

1. **Vehicle Inventory System** — How cars are stored, searched, and filtered
2. **Real-Time Availability Matrix** — Block dates, reservation conflicts, and booking validation
3. **Pricing Engine** — Base rates, peak pricing, discounts, custom pricing overrides
4. **Reservation Flow** — From search to checkout to payment completion
5. **Voucher & Promotion System** — Rule-based eligibility, usage limits, and discount application
6. **AI Chatbot Architecture** — Agent orchestration, RAG knowledge base, tool execution, and read-only adapter pattern

**Critical Architectural Principle:** The AI ecosystem is **strictly read-only** against the Tashus production database. All mutating operations (create reservation, apply voucher) are delegated to authenticated user flows on the main frontend.

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Directory Structure](#2-directory-structure)
3. [Database Schema — AI Ecosystem](#3-database-schema--ai-ecosystem)
4. [Data Models — Tashus Production](#4-data-models--tashus-production)
5. [Backend API Endpoints](#5-backend-api-endpoints)
6. [AI Chatbot Architecture](#6-ai-chatbot-architecture)
7. [Agent Tool Registry](#7-agent-tool-registry)
8. [Tashus Read-Only Adapter](#8-tashus-read-only-adapter)
9. [Service Flows — Critical Paths](#9-service-flows--critical-paths)
10. [Payload Examples — JSON Contracts](#10-payload-examples--json-contracts)
11. [Frontend State Management](#11-frontend-state-management)
12. [Availability Validation Logic](#12-availability-validation-logic)
13. [Price Calculation Pipeline](#13-price-calculation-pipeline)
14. [Security & Authentication](#14-security--authentication)
15. [Admin Chat Management System](#15-admin-chat-management-system)
16. [Deployment & Configuration](#16-deployment--configuration)
17. [Monitoring & Observability](#17-monitoring--observability)
18. [Future Enhancements](#18-future-enhancements)

---

## 1. Technology Stack

### Frontend (Tashus_Frontend_V1)
| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.4 |
| Language | TypeScript | 5.1.3 |
| UI | MUI v5 + Tailwind CSS | 3.3.2 |
| State | React Context + TanStack Query | v4 |
| Forms | React Hook Form + Zod | v7 |
| HTTP | Axios (authenticated) | v1.4 |
| Auth | NextAuth v4 (JWT) | - |
| Payment | Stripe Elements + Stripe.js | v3 |
| Maps | Leaflet / React-Leaflet | - |
| Date/Time | Day.js (UTC plugins) | - |
| Deployment | Vercel | - |

### Backend (TashusChatBot/ai-backend)
| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js 15 (App Router) | 15.1.3 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Supabase) | - |
| Vector Store | pgvector (1536-dim embeddings) | - |
| ORM | Supabase Client (native SQL) | - |
| AI Provider | Anthropic Claude Sonnet 4.5 | - |
| Secondary LLM | Groq (Llama 3.3 70B for cost opt) | - |
| Embeddings | OpenAI text-embedding-3-small | 1536-dim |
| Realtime | Redis (channels + SSE) | - |
| PDF Parsing | pdf-parse / pdf.js | - |
| Deployment | Vercel | - |

### Admin Dashboard (ai-admin)
| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | MUI v6 + Tailwind |
| State | React Context + SWR |
| Auth | Session cookies + JWT |

### Widget (ai-widget)
| Layer | Technology |
|---|---|
| Framework | React 18 (standalone bundle) |
| Build | Vite |
| UI | CSS Modules (no external deps) |
| Transport | Fetch API (native) + SSE |

---

## 2. Directory Structure


### Frontend (Tashus_Frontend_V1/src)
```
src/
├── app/                              # Next.js App Router pages
│   ├── api/auth/                     # NextAuth handlers
│   ├── search/                       # Vehicle search results
│   │   └── [vehicleId]/
│   │       ├── vehicle-details/      # Public detail page
│   │       ├── checkout/             # Reservation checkout
│   │       └── payment/[reservationId]/  # Stripe payment
│   ├── car-listing/[carListingId]/   # Host listing wizard (7 steps)
│   ├── promotion/[voucherSlug]/      # Voucher landing page
│   ├── dashboard/[userId]/           # User dashboard
│   │   └── travels/details/[reservationId]/  # Reservation details
│   └── payment/holdAmount/[reservationId]/   # Hold deposit
│
├── components/
│   ├── CarListing/                   # Listing wizard step components
│   ├── Search/ReservationCheckout/   # Checkout form + voucher UI
│   ├── Payment/                      # Stripe Elements
│   └── UserProfileUpdated/Travels/   # Reservation management
│
├── context/
│   ├── SearchProvider.tsx            # Search + availability + pricing state
│   ├── CarListingProvider.tsx        # Host listing wizard state
│   ├── TravelProvider.tsx            # Active reservation state
│   └── PaymentDetailsProvider.tsx    # Payment flow state
│
├── hooks/
│   ├── car-listing/                  # Listing CRUD mutations
│   ├── car-search/                   # Search + block-date queries
│   ├── reservation/                  # Reservation CRUD
│   │   └── voucher/                  # Voucher validation hooks
│   └── payment/reservation-payment/  # Stripe intent creation
│
├── types/
│   ├── car-listing/                  # Vehicle data models
│   ├── car-search/                   # Search result types
│   ├── travels/                      # Reservation, trip enums
│   ├── checkout/                     # Checkout, voucher, credit
│   ├── voucher-promotion/            # TVoucher, TPromotion
│   └── payment/                      # Payment intent types
│
└── utils/Functions/
    ├── reservationValidationFn.tsx   # Availability + price logic
    ├── utcCommonFn.tsx               # UTC date helpers
    └── searchCommonFn.tsx            # Notice period helpers
```

### Backend (TashusChatBot/ai-backend/src)
```
src/
├── app/api/
│   ├── admin/                              # ai-backend admin routes (parallel implementation)
│   │   ├── sessions/route.ts               # List/search sessions
│   │   ├── sessions/[id]/route.ts          # Session detail
│   │   ├── sessions/[id]/message/route.ts  # Admin send message (requires admin_id in body)
│   │   ├── sessions/[id]/resume/route.ts   # Resume AI — PUT, does NOT clear assigned_admin_id
│   │   └── notifications/stream/route.ts   # SSE for handoff alerts
│   └── ai/                                 # Widget-facing API
│       ├── chat/route.ts                   # Create session + message
│       ├── chat/stream/route.ts            # SSE streaming chat
│       ├── chat/[sessionId]/history/route.ts # Message history
│       ├── session/route.ts                # Session metadata
│       ├── session/[id]/request-handoff/route.ts  # Activate circuit breaker
│       └── session/[id]/stream/route.ts    # SSE — delivers admin messages to widget
│
├── agent/
│   ├── orchestrator.ts               # Main LLM orchestration loop
│   ├── tools.ts                      # Tool schema registry
│   ├── tool-executor.ts              # Tool dispatch + logging
│   ├── llm.ts                        # Multi-provider LLM caller
│   ├── token-bucket.ts               # Rate limiting (token-based)
│   ├── config.ts                     # Agent config loader
│   └── prompts/system-prompt.md      # Main system prompt
│
├── integrations/tashus-adapter/
│   ├── client.ts                     # HTTP client (allow-list enforced)
│   ├── endpoints.ts                  # Typed endpoint functions
│   ├── filter-engine.ts              # Code-level vehicle filtering
│   └── types.ts                      # Tashus response DTOs
│
├── rag/
│   ├── retriever.ts                  # Hybrid retrieval (KB + docs)
│   ├── embedder.ts                   # OpenAI embedding wrapper
│   └── ingestion/                    # PDF upload + chunking
│
├── db/
│   ├── client.ts                     # Supabase client singleton
│   ├── schema.sql                    # Full DDL
│   └── migrations/                   # Version-controlled DDL changes
│
├── realtime/
│   ├── redis.ts                      # Redis pub/sub client
│   └── sse.ts                        # SSE stream helper
│
└── workers/
    └── pdf-processor.ts              # Background PDF ingestion
```

---

## 3. Database Schema — AI Ecosystem

The AI chatbot uses a **completely separate Supabase PostgreSQL database** from Tashus production. No shared tables. No cross-database queries.

**Schema file:** `ai-backend/src/db/schema.sql`

### Core Tables

#### `ai_chat_sessions`
Tracks every conversation initiated via the widget.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK, auto-generated |
| `visitor_id` | text | Anonymous ID from client localStorage |
| `tashus_user_id` | text (nullable) | Linked only if user authenticates via Tashus JWT |
| `tashus_user_role` | text (nullable) | 'guest' \| 'host' |
| `channel` | text | 'widget' \| 'email' \| 'voice' \| 'social' (future) |
| `status` | text | 'active' \| 'handed_off' \| 'closed' \| 'archived' |
| `is_ai_paused` | boolean | **Circuit breaker** — when true, AI does NOT respond |
| `assigned_admin_id` | uuid (nullable) | Admin user who took over (if handed off) |
| `locale` | text | 'en-AU' default |
| `metadata` | jsonb | { page_url, referrer, device, conversation_summary } |
| `started_at` | timestamptz | Session creation time |
| `last_message_at` | timestamptz | Updated on every message (used for sorting) |
| `closed_at` | timestamptz (nullable) | When session was closed |

**Indexes:**
- `idx_sessions_status` on `status`
- `idx_sessions_visitor` on `visitor_id`
- `idx_sessions_assigned_admin` on `assigned_admin_id`
- `idx_sessions_last_message` on `last_message_at DESC`


#### `ai_chat_messages`
Every turn in a conversation (user, assistant, admin, system, tool).

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → ai_chat_sessions.id |
| `role` | text | 'user' \| 'assistant' \| 'admin' \| 'system' \| 'tool' |
| `content` | text | Message body (plaintext or markdown) |
| `tool_calls` | jsonb (nullable) | Structured log of tool invocations |
| `tool_results` | jsonb (nullable) | Structured log of tool responses |
| `sent_by_admin_id` | uuid (nullable) | If role='admin', which admin sent it |
| `tokens_in` | int (nullable) | Input token count |
| `tokens_out` | int (nullable) | Output token count |
| `latency_ms` | int (nullable) | Generation latency |
| `created_at` | timestamptz | Message timestamp |

**Index:** `idx_messages_session` on `(session_id, created_at)`

---

#### `ai_tool_call_logs`
**Compliance proof** — every single call to the Tashus Read-Only Adapter is logged here.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid (nullable) | FK → ai_chat_sessions.id |
| `tool_name` | text | e.g. 'search_vehicles', 'get_vehicle_details' |
| `http_method` | text | **CHECK CONSTRAINT: MUST = 'GET'** (read-only proof) |
| `endpoint` | text | Full URL path (e.g. '/search/find-cars') |
| `request_params` | jsonb | Query params sent |
| `response_status` | int | HTTP status code |
| `response_summary` | jsonb | Redacted response (never stores full payload) |
| `cache_hit` | boolean | Whether response was served from cache |
| `duration_ms` | int | HTTP round-trip time |
| `tokens_in` | int (nullable) | For LLM-turn logs (not raw tool calls) |
| `tokens_out` | int (nullable) | For LLM-turn logs |
| `token_cost_usd` | numeric(12,8) (nullable) | Computed cost |
| `provider` | text (nullable) | 'groq' \| 'openrouter' \| 'anthropic' |
| `created_at` | timestamptz | Log timestamp |

**Indexes:**
- `idx_tool_logs_session` on `session_id`
- `idx_tool_logs_created_at` on `created_at DESC`
- `idx_tool_logs_tool_name` on `tool_name`
- `idx_tool_logs_provider` on `(provider, created_at DESC)`

**Critical:** The `http_method = 'GET'` constraint is a **database-level guarantee** that no mutating HTTP verb (POST, PUT, DELETE) can ever be logged. This makes it structurally impossible for the AI to perform write operations.

---

#### `ai_documents` + `ai_document_chunks`
RAG pipeline — PDF uploads chunked and embedded for semantic search.

**ai_documents:**
| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `title` | text | Display name |
| `category` | text | 'rental_policy' \| 'insurance' \| 'faq_source' \| 'terms' \| 'general' |
| `original_filename` | text | e.g. 'cancellation_policy_v2.pdf' |
| `storage_path` | text | Path in Supabase Storage bucket `ai-documents` |
| `mime_type` | text | 'application/pdf' |
| `file_size_bytes` | bigint | |
| `status` | text | 'pending' \| 'parsing' \| 'embedding' \| 'ready' \| 'failed' |
| `error_message` | text (nullable) | If status='failed' |
| `uploaded_by` | uuid | FK → ai_admin_users.id |
| `version` | int | Increments on re-upload (same title) |
| `is_active` | boolean | Only active documents are searched |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**ai_document_chunks:**
| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `document_id` | uuid | FK → ai_documents.id |
| `chunk_index` | int | Ordinal position in document |
| `content` | text | Prefixed with header breadcrumb (e.g. "Cancellation Policy > Late Fees: ...") |
| `page_number` | int (nullable) | Source PDF page |
| `token_count` | int | For context budget estimation |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |
| `created_at` | timestamptz | |

**Index:** `idx_chunks_embedding_hnsw` — HNSW index on `embedding` using `vector_cosine_ops` for approximate nearest-neighbor search.

---

#### `ai_knowledge_base`
Admin-authored FAQs and instructions (highest priority in retrieval).

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `entry_type` | text | 'faq' \| 'instruction' \| 'promotion' \| 'override' |
| `question` | text (nullable) | For FAQs |
| `answer` | text | The content the AI should return |
| `tags` | text[] | For filtering/search |
| `priority` | int | Higher = wins ties (default 100) |
| `embedding` | vector(1536) | Semantic search |
| `is_active` | boolean | Only active entries are retrieved |
| `starts_at` | timestamptz (nullable) | Delayed activation |
| `ends_at` | timestamptz (nullable) | Expiry (for promotions) |
| `created_by` | uuid | FK → ai_admin_users.id |
| `updated_by` | uuid (nullable) | FK → ai_admin_users.id |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Index:** `idx_kb_embedding_hnsw` on `embedding`

---

#### `ai_agent_configs`
System prompt + model settings.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `config_key` | text UNIQUE | e.g. 'production', 'staging' |
| `system_prompt` | text | Full markdown system prompt |
| `model` | text | 'claude-sonnet-4-5' |
| `temperature` | numeric(3,2) | 0.30 default |
| `max_tokens` | int | 1024 default |
| `enabled_tools` | text[] | Array of tool names (from AGENT_TOOLS registry) |
| `is_active` | boolean | Only one active config at a time |
| `updated_by` | uuid | FK → ai_admin_users.id |
| `updated_at` | timestamptz | |

---

### RAG Functions (PostgreSQL)

```sql
-- Knowledge base semantic search
create function search_knowledge_base(
  query_embedding vector(1536),
  similarity_threshold float default 0.75,
  match_count int default 5
)
returns table (id uuid, question text, answer text, priority int, similarity float);

-- Document chunk semantic search
create function search_document_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (id uuid, content text, "pageNumber" int, "documentTitle" text, "documentCategory" text);
```

These are called via `supabase.rpc('search_knowledge_base', { query_embedding: [...] })` from `ai-backend/src/rag/retriever.ts`.

---

## 4. Data Models — Tashus Production

These types mirror the Tashus production MongoDB schema. The AI backend **never writes** to these — it only reads via the Read-Only Adapter.

**Source files:**
- `Tashus_Frontend_V1/src/types/car-listing/carListingTypes.ts`
- `Tashus_Frontend_V1/src/types/travels/typeTravels.ts`
- `Tashus_Frontend_V1/src/types/voucher-promotion/promotionTypes.ts`

### 4.1 Vehicle (`CarDataState`)

**MongoDB collection:** `carListings` (inferred from API responses)

```typescript
type CarDataState = {
  _id: string;                        // MongoDB ObjectId
  hostId: string;                     // Owner's userId
  listingId: number;                  // Auto-incrementing numeric ID (unique across DB)
  listingStatus: 'draft' | 'pending' | 'listed' | 'unlisted' | 'update' | ...;
  carNickName: string;
  
  car: {
    licensePlate: { number: string; state: string };
    vin: string;
    make: string;                     // e.g. 'Toyota'
    model: string;                    // e.g. 'RAV4'
    year: number;                     // e.g. 2022
    color: string;                    // e.g. 'Blue'
    carType: string;                  // 'SUV' | 'Sedan' | 'Hatchback' | 'Ute' | 'Van' | ...
    seats: number;                    // 2–8
    doors: number;                    // 2, 3, 4, 5
    windows: number;
    fuelType: string;                 // 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid'
    transmissionType: string;         // 'Manual' | 'Automatic'
    trim: string;
    expiry: string;                   // Registration expiry date
    mileage: { distance: number; units: string };  // e.g. { distance: 25000, units: 'km' }
  };
  
  features: string[];                 // Standard features ['Air Conditioning', 'Bluetooth', ...]
  additionalFeatures: string[];       // Host-added features ['Roof Rails', 'Tow Bar']
  additionalInfos: {
    carDescription: string;           // Rich HTML text
    guidelines: string;               // Host-provided rules
  };
  
  location: {
    pickupAddress: {
      city: string;
      state: string;
      stateShortCode: string;         // 'nsw' | 'vic' | 'qld' | ...
      country: string;
      countryShortCode: string;       // 'au'
      street: string;
      postalCode?: string;
      coordinates: [number, number];  // [lng, lat] — GeoJSON order
    };
    parkingInstructions: string;
  };
  
  availability: CarDataAvailability;  // See §4.2
  rates: CarDataRates;                // See §4.3
  photos: CarDataPhotos;              // See below
  distance: CarDataDistance;          // Usage limits
  
  totalTrips: number;                 // Completed bookings
  ratingsReceivedFrom: number;        // Review count
  totalRatings: number;               // Sum of all ratings (avg = totalRatings / ratingsReceivedFrom)
  
  insurancePolicies: CarDataInsuranceInfo[];
  createdAt: string;                  // ISO date
  updatedAt: string;
};
```

**Photo sub-model:**
```typescript
type CarDataPhotos = {
  coverPhoto: TPhoto;
  initialConditionPhotos: TPhoto[];
  additionalPhotos: TPhoto[];
  vehicleInspectionPhotos: TPhoto[];
  updatedAt: string;
};

type TPhoto = {
  imageInfo: {
    public_id: string;                // Cloudinary public ID
    secure_url: string;               // HTTPS URL
    format: string;                   // 'jpg' | 'png'
    bytes?: number;
    originalHeight?: number;
    originalWidth?: number;
  };
  storageProvider?: string;           // 'cloudinary'
};
```

**Distance & Fuel:**
```typescript
type CarDataDistance = {
  unlimitedTravel: boolean;
  maximumDailyDistance: number;       // km per day limit
  additionalFeePerKilometer: number;  // AUD per km over limit
  fuelGauges: CarDataFuelGauge[];
  fuelEconomy?: { maxFuel: number; fuelCost: number };
};
```

---

### 4.2 Availability Matrix (`CarDataAvailability`)

**File:** `src/types/car-listing/carAvailabilityTypes.ts`

This structure controls when a vehicle can be picked up and returned.

```typescript
type CarDataAvailability = {
  pickupReturnHour: {
    alwaysAvailable: boolean;         // If true, 24/7 availability (ignores customAvailability)
    customAvailability?: {
      dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
      availability: 'always' | 'never' | 'custom';
      allDay: boolean;                // If true, entire day follows 'availability' status
      checked: boolean;               // UI state flag
      customHours: {
        startTime: Date;              // UTC ISO string
        endTime: Date;                // UTC ISO string
        status: 'booked' | 'reserved' | 'free';
      }[];
    }[];
  };
  
  noticeInAdvance: {
    alwaysAvailableImmediately: boolean;  // If false, advance notice required
    hoursRequired?: number;               // 1–24 hrs advance notice
  };
  
  minTripDuration: {
    noMinimum: boolean;
    unit: 'hours' | 'days' | 'weeks';
    shortestDuration: number;             // e.g. 3 (hours), 1 (day), 1 (week)
  };
  
  maxTripDuration: {
    noMaximum: boolean;
    unit: 'days' | 'weeks';
    longestDuration: number;              // e.g. 7 (days), 2 (weeks)
  };
};
```

**Block Dates** (fetched separately per vehicle):
```typescript
type TCarBlockDate = {
  _id: string;
  start: Date;                        // UTC ISO string
  end: Date;                          // UTC ISO string
  title: string;                      // e.g. 'Blocked', 'Personal Use'
  createdAt: Date;
};

// API response split:
type TBlockDatesResponse = {
  allDayList: TCarBlockDate[];        // start is 00:00:00 UTC, end is 23:59:59 UTC
  customList: TCarBlockDate[];        // specific hour ranges
};
```

**Critical:** The frontend validates every booking request against:
1. `customAvailability` (per-day, per-slot)
2. `allDayList` + `customList` (blocked windows)
3. Existing confirmed/pending reservations (±29 min buffer)
4. `noticeInAdvance.hoursRequired`
5. `minTripDuration` + `maxTripDuration`

No server-side booking creation happens without passing all 5 checks.

---

### 4.3 Rates & Pricing (`CarDataRates`)

**File:** `src/types/car-listing/carPricingTypes.ts`

```typescript
type CarDataRates = {
  hourlyRates: { currency: string; amount: number };  // e.g. { currency: 'AUD', amount: 12.5 }
  dailyRates:  { currency: string; amount: number };  // e.g. { currency: 'AUD', amount: 89.0 }
  
  // Peak pricing surcharge (e.g. weekends cost more)
  peakIncrease: {
    dayOfWeek: string;                // 'mon' | 'tue' | ... | 'sun'
    increaseType: 'amount' | 'percentage';
    amount?: number;                  // Fixed AUD increase
    percentage?: number;              // Percentage increase (e.g. 15 = +15%)
  }[];
  
  // Long-stay discounts (e.g. 7+ days = 10% off)
  longBookingDiscounts: {
    value: string | number;           // Threshold duration
    unit: 'days' | 'weeks' | '';
    percentage: string | number;      // Discount % (e.g. 10 = -10%)
  }[];
  
  // Advance-booking discounts (e.g. book 7+ days ahead = 5% off)
  advanceBookingDiscounts: {
    value: string | number;
    unit: 'days' | 'weeks' | '';
    percentage: string | number;
  }[];
  
  longBookingDiscountActive?: boolean;
  advanceBookingDiscountActive?: boolean;
  
  // Date-specific custom pricing overrides
  customPricing: {
    date: string;                     // ISO date string (single day)
    hourlyRates: number;
    dailyRates: number;
    updatedHourlyRates: number;       // Final computed value after adjustment
    updatedDailyRates: number;
    rateType?: 'F' | 'P';             // Fixed or Percentage adjustment
    rateChange?: 'I' | 'D';           // Increase or Decrease
  }[];
  
  updatedAt?: string;
};
```

**Pricing Calculation Order:**
1. Base duration price = `(totalDays × dailyRate) + (remainingHours × hourlyRate)`
2. Apply `customPricing[]` overrides (replaces base rates for specific dates)
3. Apply `peakIncrease` (for matching days in date range)
4. Apply `longBookingDiscounts` (highest qualifying tier)
5. Apply `advanceBookingDiscounts` (if booking is X days in future)
6. Apply service fee (10% of total price, stored separately)
7. Apply voucher discount (if validated, post-server-check)
8. Apply credit discount (if user has credit balance)

**Final output:** `basePrice` object with all breakdowns, passed to `POST /reservation/create`.

---

### 4.4 Reservation (`TReservation`)

**MongoDB collection:** `reservations` (inferred)

**Files:** `src/types/travels/typeTravels.ts`, `travelEnums.ts`

```typescript
type TReservation = {
  reservationId: number;              // Auto-incrementing numeric ID
  guestId: string;                    // Guest's userId
  hostId: string;                     // Host's userId
  carListingId: number;               // FK → CarDataState.listingId
  startDate: Date;                    // UTC ISO string
  endDate: Date;                      // UTC ISO string
  totalDurationHours: number;
  totalDistanceKm?: number;
  dailyDistanceKm?: number;
  additionalDistanceFeePerKm?: number;
  
  basePrice: {
    dailyPrice: number;
    hourlyPrice: number;
    totalPrice: number;               // Final payable amount (after all discounts/fees)
    durationPrice: number;            // Base price before discounts
    currency: string;                 // 'AUD'
    serviceFeeAmount: number;         // 10% of totalPrice
    customPrices?: CustomPricing[];
    coverageAmount?: number;          // Insurance fee
    gstAmount?: number;
    hostIncome?: number;              // Host's net payout
    totalDeliveryFee?: number;
    totalReturnFee?: number;
    deliveryFeeDiscount?: number;
    returnFeeDiscount?: number;
    payableAmount?: number;           // Amount charged to card
    refundableAmount?: number;        // Amount to refund on cancellation
  };
  
  serviceFeePercentage: number;       // e.g. 10 (= 10%)
  depositAmount: number;              // Security deposit (AUD, held not charged)
  
  reservationStatus: EReservationStatus;
  // 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'cancelledByGuest' | 'cancelledByHost' | ...
  
  paymentStatus?: ReservationPaymentStatusEnum;
  // 'pending' | 'pendingCharge' | 'paid' | 'refundable' | 'refunded' | 'refundedAsCredit' | ...
  
  paymentMethod?: TPaymentMethods;
  // 'onlyCard' | 'onlyVoucher' | 'onlyCredit' | 'cardWithCredit' | 'cardWithVoucher' | ...
  
  pickupLocation: ReservationLocationState;
  dropOffLocation: ReservationLocationState;
  
  discounts?: {
    advanceBookingDiscounts?: TDiscountedPrice;
    longBookingDiscounts?: TDiscountedPrice;
  };
  
  peakIncrease?: {
    calculatedAmount?: number;
    increaseType?: 'percentage' | 'amount';
    increaseAmount?: number;
    increaseDays?: string[];          // ['sat', 'sun']
  };
  
  insurance?: {
    guestCoverageType: string;        // 'standard' | 'premium' | 'deluxe'
    coveragePercentage: number;       // 60 | 70 | 80 | 90
    excessFee: number;                // AUD
  };
  
  additionalPaymentInfo?: {
    cardAmountUsed?: number;
    creditAmountUsed?: number;
    voucherCode?: string;
    voucherAmountUsed?: number;
    voucherId?: string;
    voucherUsedId?: string;           // Audit record ID in voucher.voucherUsedBy[]
    chargeId?: string;                // Stripe charge ID
  };
  
  tripInformation?: TTripInformation;
  revisedReservations?: TRevisedReservation[];  // History of date/time changes
  revisedVehicles?: TRevisedVehicle[];          // History of vehicle swaps
  revisedCoverages?: TRevisedCoverage[];        // History of insurance changes
  voucherInfo?: TVoucherInfo;
  notes?: TReservationNote[];
};
```

**Reservation Status Enum:**
```typescript
enum EReservationStatus {
  Pending        = 'pending',
  Confirmed      = 'confirmed',
  Completed      = 'completed',
  AdminCancelled = 'adminCancelled',
  AutoCompleted  = 'autoCompleted',
  AdminCompleted = 'adminCompleted',
  Disputed       = 'disputed',
  ForcedCompletion = 'forcedCompletion',
  Cancelled      = 'cancelled',
  CancelledByHost  = 'cancelledByHost',
  CancelledByGuest = 'cancelledByGuest',
}
```

---

### 4.5 Voucher (`TVoucher`)

**MongoDB collection:** `vouchers` (inferred)

**File:** `src/types/voucher-promotion/promotionTypes.ts`

```typescript
type TVoucher = {
  _id: string;
  promotionId: string;                // Parent TPromotion._id
  voucherCode: string;                // Unique alphanumeric code (e.g. 'SUMMER25')
  voucherSlug: string;                // URL-friendly slug for public landing page
  voucherTitle: string;
  description: string;
  
  // Discount configuration
  discountType: 'fixed' | 'percentage';
  discountAmount: number;             // Value (AUD or %)
  maxDiscountAmount: number | null;   // Cap for percentage discounts
  
  // Usage limits
  maxUsageCount: number;              // Total redemptions allowed across all users
  maxUsagePerUser: number;            // Per-user limit
  voucherUsageCount: number;          // Current total redemption count
  voucherUsageAmount: number;         // Total AUD discount given out
  
  // Lifecycle
  isActive: boolean;
  isPaused: boolean;
  isPublic: boolean;
  isExpired: boolean;
  activateAt?: string;                // ISO date — delayed activation
  expiresAt: string;                  // ISO date — hard expiry
  
  // Eligibility rules (rules engine)
  voucherRules: TVoucherRule[];
  
  // Media & metadata
  voucherImages: { public_id: string; secure_url: string }[];
  voucherTerms?: any;
  applicableUserDescription?: string;
  
  // Usage audit
  voucherUsedBy: {
    userId: string;
    amount: number;                   // AUD discount given to this user
    reservationId: number;
    _id: string;
  }[];
  
  createdBy: string;
  creator: { adminUserName: string; adminId: string };
  changeLogs: ChangeLog[];
  createdAt: string;
  updatedAt: string;
};
```

**Voucher Rule (eligibility engine):**
```typescript
type TVoucherRule = {
  id: string;
  field: string;        // e.g. 'carType', 'reservationDuration', 'guestTotalTrips',
                        //      'monthOfTravel', 'isEmailVerified', 'carListingId', 'firstTravel'
  operator: string;     // e.g. '=', '>', '>=', '<', '<=', 'in', 'contains', 'between'
  valueSource: string;  // 'value' (static) | 'field' (dynamic)
  value: any;           // The comparison target
};
```

**Validation Flow:**
1. Check `isActive`, `!isPaused`, `!isExpired`
2. Check `activateAt <= now <= expiresAt`
3. Check `voucherUsageCount < maxUsageCount`
4. Check user's usage count < `maxUsagePerUser`
5. **Evaluate ALL `voucherRules`** against `additionalData` (reservation fields + user metadata)
   - If ANY rule fails → voucher invalid
   - If ALL rules pass → voucher valid

**Example Rules:**
```json
[
  { "field": "carType", "operator": "in", "value": ["SUV", "Sedan"] },
  { "field": "reservationDuration", "operator": ">=", "value": 72 },
  { "field": "monthOfTravel", "operator": "=", "value": "december" },
  { "field": "guestTotalTrips", "operator": "=", "value": 0 },
  { "field": "isEmailVerified", "operator": "=", "value": true }
]
```

---

### 4.6 Promotion (`TPromotion`)

**MongoDB collection:** `promotions` (inferred)

```typescript
type TPromotion = {
  _id: string;
  title: string;
  description: string;
  totalBudget: number;                // AUD — total campaign budget
  remainingBudget: number;            // AUD — budget remaining
  promotionRules: TVoucherRule[];     // Top-level rules inherited by child vouchers
  expiresAt: string;                  // ISO date
  isExpired: boolean;
  createdBy: string;                  // Admin userId
  vouchers: string[];                 // Array of TVoucher._id references
  updatedBy: { adminId: string; updatedAt: string; _id: string }[];
  changeLogs: any[];
  createdAt: string;
  updatedAt: string;
};
```

**Hierarchy:**
- 1 Promotion → N Vouchers
- Promotion-level rules apply to ALL child vouchers
- Voucher-level rules are AND-combined with promotion rules

---

## 5. Backend API Endpoints

### 5.1 Frontend (Tashus Production) — Public Endpoints

**Base URL:** `NEXT_PUBLIC_API_URL` (e.g. `https://services.tashus.com/api`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/search/find-cars` | ❌ | Search vehicles by location + dates + filters |
| GET | `/search/find-cars/:listingId` | ❌ | Get full vehicle detail by listing ID |
| GET | `/reservation/block-dates-by-car/:carListingId` | ❌ | Fetch blocked date windows for a vehicle |
| GET | `/voucher/get-common-vouchers` | ❌ | Fetch publicly available vouchers |
| GET | `/v2/voucher/slug/:voucherSlug` | ❌ | Fetch single voucher by URL slug |
| PUT | `/search/vehicle-delivery-price/:drivingDistanceInKm` | ❌ | Calculate delivery fee by km |

### 5.2 Frontend — Authenticated Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/listing/car-details` | ✅ | Create/update vehicle info (Step 1) |
| PUT | `/listing/availability/:listingId` | ✅ | Save availability matrix (Step 3) |
| PUT | `/listing/rates/:listingId` | ✅ | Save pricing rates (Step 4) |
| POST | `/reservation/create` | ✅ | Create a new reservation |
| GET | `/reservation/find-details/:reservationId` | ✅ | Fetch single reservation detail |
| PUT | `/reservation/travel-cancel-by-host/:reservationId` | ✅ | Host cancels upcoming reservation |
| POST | `/payment/stripe-element` | ✅ | Create Stripe payment intent (immediate charge) |
| POST | `/payment/stripe-hold-with-payment` | ✅ | Create Stripe payment intent (charge + hold) |
| POST | `/payment/stripe-hold-only` | ✅ | Create Stripe payment intent (hold only) |
| PUT | `/v2/voucher/validate-voucher` | ✅ | Validate voucher code (current flow) |
| POST | `/voucher/get-vouchers/:userId` | ✅ | Fetch vouchers eligible for logged-in user |

---

### 5.3 AI Backend — Widget API

**Base URL:** `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3001` in dev, `https://ai-backend.tashus.com` in prod)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/chat` | ❌ | Create session + send message (non-streaming) |
| POST | `/api/ai/chat/stream` | ❌ | Create session + send message (SSE streaming) |
| GET | `/api/ai/chat/:sessionId/history` | ❌ | Fetch message history for a session |
| POST | `/api/ai/session` | ❌ | Create empty session |
| POST | `/api/ai/session/:id/request-handoff` | ❌ | Activate circuit breaker, notify admins |
| GET | `/api/ai/session/:id/stream` | ❌ | SSE stream — delivers admin messages to widget |
| POST | `/api/ai/verify-tashus-token` | ❌ | Read-only verification of Tashus JWT |

### 5.4 AI Backend — Admin API (ai-backend routes)

These routes exist in `ai-backend` but are **not** used by the admin panel UI. They are a parallel, lower-level implementation.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/sessions` | ✅ | List sessions (paginated) |
| GET | `/api/admin/sessions/:id` | ✅ | Session detail + full message thread |
| POST | `/api/admin/sessions/:id/message` | ✅ | Admin sends a message (requires `admin_id` in body) |
| PUT | `/api/admin/sessions/:id/resume` | ✅ | Resume AI (set `is_ai_paused=false`, does NOT clear `assigned_admin_id`) |
| GET | `/api/admin/notifications/stream` | ✅ | SSE — broadcasts handoff alerts |

### 5.5 AI Admin Panel Proxy Routes (ai-admin routes — used by the UI)

These are in `ai-admin/src/app/api/admin/` and are what `sessions/page.tsx` actually calls.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/sessions` | `isLocalDevMode()` / `getAdminFromRequest()` | List sessions with stats |
| GET | `/api/admin/sessions/:id` | ✅ | Full session + messages |
| POST | `/api/admin/sessions/:id/takeover` | ✅ | Set `is_ai_paused=true`, assign admin, publish Redis |
| POST | `/api/admin/sessions/:id/messages` | ✅ | Send admin message (HTTP 423 if AI active) |
| POST | `/api/admin/sessions/:id/release` | ✅ | Set `is_ai_paused=false`, clear `assigned_admin_id=null` |
| PATCH | `/api/admin/sessions/:id` | ✅ | Set `status='closed'` |
| GET | `/api/admin/notifications/stream` | ❌ (proxies ai-backend) | SSE for handoff alerts |

---

## 6. AI Chatbot Architecture

### 6.1 Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI WIDGET (React)                         │
│  • Embedded iframe on Tashus pages                               │
│  • Sends messages to /api/ai/chat/stream                         │
│  • Listens to /api/ai/session/:id/stream for admin replies      │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               AI BACKEND — /api/ai/chat/stream                   │
│  1. Create/fetch ai_chat_sessions record                        │
│  2. Insert ai_chat_messages (role='user')                       │
│  3. Call orchestrator.run()                                     │
│  4. Stream response via SSE                                     │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ORCHESTRATOR (orchestrator.ts)                   │
│  • Loads system prompt + tools from config                      │
│  • Checks is_ai_paused flag (circuit breaker)                   │
│  • Fetches recent message history                               │
│  • Calls LLM provider (Claude Sonnet 4.5 primary)               │
│  • Handles tool_use blocks:                                     │
│    - Dispatches to executeTool()                                │
│    - Logs to ai_tool_call_logs                                  │
│    - Sends tool_result back to LLM                              │
│  • Streams final assistant message back to API route            │
│  • Inserts ai_chat_messages (role='assistant')                  │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TOOL EXECUTOR (tool-executor.ts)               │
│  • Dispatches tool calls to:                                    │
│    - Tashus Read-Only Adapter (search_vehicles, etc.)           │
│    - RAG Retriever (search_knowledge_base)                      │
│  • Logs every call to ai_tool_call_logs                         │
│  • Enforces GET-only constraint at dispatch level               │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          TASHUS READ-ONLY ADAPTER (tashus-adapter/*)             │
│  • HTTP client with ALLOW-LIST of endpoints                     │
│  • Typed endpoint functions (endpoints.ts)                      │
│  • Vehicle filter engine (filter-engine.ts)                     │
│  • Token optimization: 94% reduction on search, 90% on details  │
│  • ALL calls logged to ai_tool_call_logs with http_method='GET'│
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.2 Orchestrator Flow (`processMessageStream` in `orchestrator.ts`)

```
processMessageStream(sessionId, userText, userContext?)

1. Insert user message → ai_chat_messages (role='user')

2. CIRCUIT BREAKER CHECK
   Query: is_ai_paused from ai_chat_sessions
   If true → yield { type:'done', message:'', sources:[] } and return immediately.
   Zero tokens spent. No LLM call.

3. Load in parallel:
   a. loadActiveAgentConfig() — system_prompt, model, enabled_tools, temperature
   b. loadConversationState() — last 6 messages (reversed chronological) + summary
      admin role messages are mapped to 'assistant' before being fed to the LLM

4. intentNeedsRag(userText)
   - Greetings / messages ≤3 words → false (skip RAG)
   - Transactional keywords (book, rent, vehicle, voucher…) → false
   - Policy keywords (cancel, insurance, fee, smoking…) → true
   - Default → true

5. If RAG needed:
   retrieve(userText) → parallel pgvector search in ai_knowledge_base + ai_document_chunks
   Store result in ragDedupCache(sessionId, userText, context)

6. Build prompt:
   staticSystem  = config.system_prompt              ← Groq prefix-cached (50% cost)
   dynamicContext = [localized datetime block, conversation summary, RAG context]

7. Agentic loop (max 5 rounds):
   a. Call generateCompletionStream({ staticSystem, dynamicContext, messages, tools })
   b. Stream 'token' chunks to caller as they arrive
   c. On tool_use block:
      - validateToolCall(name, args) → if invalid feed error back as tool_result, continue
      - Check enabled_tools list
      - For search_knowledge_base: check ragDedupCache first
      - executeTool(name, args) → Tashus adapter or RAG retriever
      - Log to ai_tool_call_logs (http_method='GET' enforced)
      - Append tool_use + tool_result to loopMessages
      - Yield tool_start, tool_result events
   d. No tool call → break (turn complete)

8. Post-turn:
   - detectHallucinations(finalMessage, toolCalls, ragContext)
   - Insert assistant message → ai_chat_messages
   - Record token metrics to ai_tool_call_logs (__turn_summary__ row)
   - Update session.last_message_at
   - maybeEnqueueSummarization() if message count > 6
   - yield { type:'done', message, sources }
```

**Timezone injection** (`userContext` from widget):
```typescript
// Widget sends: { timezone: 'Australia/Sydney', localTime: '2026-07-13T14:30:00.000Z' }
// Injected into dynamicContext as:
// "CURRENT USER DATE & TIME: Sunday, 13 July 2026 at 2:30 pm (AEST/AEDT)
//  When user says 'tomorrow' → Monday, 14 July 2026..."
```

**`admin` role mapping:** Messages with `role='admin'` are remapped to `role='assistant'` before being sent to the LLM, so the model understands what the human agent said without being confused by an unknown role.

---

### 6.3 RAG Pipeline (rag/retriever.ts)

**Hybrid Retrieval:**
1. **Knowledge Base** (highest priority) — Admin-authored FAQs/instructions
2. **Document Chunks** (fallback) — PDF embeddings

```typescript
async function searchKnowledgeBaseTool(query: string) {
  // 1. Generate embedding for query
  const queryEmbedding = await embedText(query);  // OpenAI text-embedding-3-small
  
  // 2. Semantic search in KB
  const kbResults = await db.rpc('search_knowledge_base', {
    query_embedding: queryEmbedding,
    similarity_threshold: 0.75,
    match_count: 5
  });
  
  // 3. Semantic search in document chunks
  const chunkResults = await db.rpc('search_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8
  });
  
  // 4. Merge + priority sort
  // KB entries always rank above document chunks (due to priority field)
  const merged = [
    ...kbResults.map(kb => ({ source: 'kb', priority: kb.priority, content: kb.answer, similarity: kb.similarity })),
    ...chunkResults.map(chunk => ({ source: 'doc', priority: 0, content: chunk.content, documentTitle: chunk.documentTitle }))
  ].sort((a, b) => b.priority - a.priority);
  
  // 5. Format for LLM
  return {
    results: merged.slice(0, 5),
    metadata: { query, total_kb: kbResults.length, total_docs: chunkResults.length }
  };
}
```

**Embedding Dimensions:** 1536 (OpenAI text-embedding-3-small)
**Similarity Metric:** Cosine similarity via pgvector `<=>` operator
**Index:** HNSW (Hierarchical Navigable Small World) for approximate nearest-neighbor search

---

## 7. Agent Tool Registry

**File:** `ai-backend/src/agent/tools.ts`

The AI agent has access to exactly **5 tools**. No dynamic tool addition. No "call any URL" escape hatch.

### 7.1 `search_vehicles`

**Description:** Search live Tashus vehicle inventory by location, date range, and optional filters.

**Critical Instructions (from tool schema):**
- If user has NOT specified a city or location, ASK for it — do NOT guess or fill with placeholder
- If user has NOT specified dates, ASK for them — do NOT assume "soon", "tomorrow", etc.
- All filtering (price, seats, type) happens server-side — pass raw criteria
- `minSeats` is a FLOOR LIMIT (e.g. minSeats=5 returns 5, 7, 8-seater vehicles)
- `maxPrice` is a CEILING (e.g. maxPrice=120 returns vehicles at $120/day or cheaper)

**Input Schema:**
```typescript
{
  // Location — at least city OR lat+long required
  city?: string;              // e.g. "Sydney", "Melbourne"
  country?: string;           // e.g. "au" (default)
  region?: string;            // e.g. "nsw", "vic", "qld"
  postcode?: string;
  lat?: number;
  long?: number;
  
  // Dates — BOTH required
  from: string;               // ISO 8601 UTC (e.g. "2026-08-15T03:00:00.000Z")
  to: string;                 // ISO 8601 UTC
  
  // Optional filters
  cType?: 'SUV' | 'Sedan' | 'Hatchback' | 'Ute' | 'Van' | 'Convertible' | 'Coupe' | 'Wagon';
  tType?: 'Automatic' | 'Manual';
  fType?: 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid';
  minSeats?: number;          // Floor limit (5 = 5+ seaters)
  maxPrice?: number;          // Ceiling (AUD daily rate)
}
```

**Returns:** `FilteredSearchResult` (~750 tokens instead of raw ~12,500 tokens)

```typescript
{
  total_raw: number;          // Total vehicles fetched from API
  total_matching: number;     // Vehicles matching filters
  shown: MaskedSearchResult[];  // Top 5 masked vehicles
  filters_applied: { maxPrice?: number, minSeats?: number, ... };
}

type MaskedSearchResult = {
  listingId: number;
  make: string;
  model: string;
  year: number;
  carType: string;
  transmission: string;
  fuelType: string;
  seats: number;
  dailyRate: number;
  hourlyRate: number;
  city: string;
  totalTrips: number;
  rating: string;             // e.g. "4.8 (12 reviews)"
};
```

---

### 7.2 `get_vehicle_details`

**Description:** Fetch complete specifications, description, guidelines, features, host info, and usage restrictions for a specific vehicle listing ID.

**Input Schema:**
```typescript
{
  listingId: number;          // Unique listing ID from search results (e.g. 1022)
}
```

**Returns:** `MaskedVehicleDetails` (~500 tokens instead of raw ~5,000 tokens)

```typescript
{
  listingId: number;
  make: string;
  model: string;
  year: number;
  carType: string;
  seats: number;
  transmission: string;
  fuelType: string;
  mileage: { distance: number; units: string };
  features: string[];
  description: string;        // Stripped HTML → plaintext
  guidelines: string;         // Stripped HTML → plaintext
  rates: {
    hourly: number;
    daily: number;
    peak_info?: string;       // e.g. "15% surcharge on weekends"
    long_booking_discount?: string;   // e.g. "10% off for 7+ days"
  };
  distance_limits: {
    unlimited: boolean;
    daily_km?: number;
    fee_per_extra_km?: number;
  };
  availability_summary: {
    notice_hours?: number;
    min_duration?: string;    // e.g. "3 hours"
    max_duration?: string;    // e.g. "7 days"
  };
  host: {
    firstName: string;
    totalTrips: number;
    rating: string;           // e.g. "4.78 (45 reviews)"
  };
  location: {
    city: string;
    street: string;
    parking_instructions: string;
  };
  cover_photo_url: string;
}
```

---

### 7.3 `check_availability`

**Description:** Fetch block-dates for a specific vehicle listing to confirm live availability.

**Input Schema:**
```typescript
{
  carListingId: number;       // Vehicle listing ID to check
}
```

**Returns:** `TBlockDatesResponse`

```typescript
{
  allDayList: TCarBlockDate[];  // Full-day blocks (00:00:00 to 23:59:59 UTC)
  customList: TCarBlockDate[];  // Specific hour ranges
}

type TCarBlockDate = {
  _id: string;
  start: string;                // ISO UTC date string
  end: string;                  // ISO UTC date string
  title: string;                // e.g. "Blocked", "Personal Use"
  createdAt: string;
};
```

**Usage:** After finding a vehicle the user is interested in, call this to confirm no conflicts exist for their desired dates.

---

### 7.4 `validate_voucher`

**Description:** Look up a voucher by its public slug to confirm terms and eligibility. **NEVER applies or redeems it** — read-only lookup only.

**Input Schema:**
```typescript
{
  voucherSlug: string;        // Voucher code slug (e.g. "SUMMER25"), case-insensitive
}
```

**Returns:** `TVoucher` (full voucher object, see §4.5)

**Usage:** User asks "What's SUMMER25?" or "Do I qualify for SUMMER25?". Agent calls this to fetch terms, discount type/amount, usage limits, and eligibility rules. Agent then explains to user (but never applies the voucher — that happens in authenticated frontend checkout flow).

---

### 7.5 `search_knowledge_base`

**Description:** Semantic search across rental policies, FAQs, and uploaded guidelines. **Only call this if the information is NOT already present in your context from the system prompt.**

**Input Schema:**
```typescript
{
  query: string;              // Policy or FAQ question (e.g. "What is the cancellation policy?")
}
```

**Returns:**
```typescript
{
  results: {
    source: 'kb' | 'doc';
    priority: number;
    content: string;
    similarity?: number;
    documentTitle?: string;
  }[];
  metadata: {
    query: string;
    total_kb: number;
    total_docs: number;
  };
}
```

**Usage:** User asks a policy question that's not in the system prompt. Agent searches KB + document chunks and synthesizes answer from top results.

---

## 8. Tashus Read-Only Adapter

**Files:** `ai-backend/src/integrations/tashus-adapter/*`

### 8.1 Allow-List Enforcement (client.ts)

```typescript
const ALLOWED_ENDPOINTS = [
  '/search/find-cars',                              // Search vehicles
  '/search/find-cars/:listingId',                   // Vehicle details
  '/reservation/block-dates-by-car/:carListingId',  // Block dates
  '/voucher/get-common-vouchers',                   // Public vouchers
  '/v2/voucher/slug/:voucherSlug',                  // Single voucher
  '/search/vehicle-delivery-price/:drivingDistanceInKm'  // Delivery fee
];

async function tashusGet<T>(endpoint: string, opts: RequestOpts): Promise<T> {
  // 1. Validate endpoint against allow-list
  if (!isAllowedEndpoint(endpoint)) {
    throw new Error(`Endpoint not in allow-list: ${endpoint}`);
  }
  
  // 2. Build full URL
  const url = new URL(endpoint, TASHUS_API_BASE_URL);
  Object.entries(opts.params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  
  // 3. Make HTTP GET request
  const response = await fetch(url.toString(), {
    method: 'GET',  // Hard-coded — no POST/PUT/DELETE possible
    headers: { 'Content-Type': 'application/json' }
  });
  
  // 4. Log to ai_tool_call_logs
  await logToolCall({
    session_id: opts.sessionId,
    tool_name: opts.toolName,
    http_method: 'GET',  // Enforced — satisfies DB constraint
    endpoint,
    request_params: opts.params,
    response_status: response.status,
    response_summary: { ... },
    duration_ms: elapsed
  });
  
  // 5. Return parsed JSON
  return response.json();
}
```

**Critical:** The `http_method` field is **hard-coded to 'GET'** at both the client and database constraint levels. This makes it **architecturally impossible** for the AI to perform write operations.

---

### 8.2 Vehicle Filter Engine (filter-engine.ts)

**Purpose:** Reduce token consumption by 94% (search) and 90% (details) via code-level filtering and masking.

#### Filter Criteria
```typescript
type FilterCriteria = {
  maxPrice?: number;          // AUD daily rate ceiling
  minSeats?: number;          // Passenger capacity floor
  vehicleType?: string;       // 'SUV' | 'Sedan' | ...
  transmission?: string;      // 'Automatic' | 'Manual'
  fuelType?: string;          // 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid'
};
```

#### Search Result Processing
```typescript
function processSearchResults(
  rawVehicles: TSearchedCar[],
  criteria: FilterCriteria
): FilteredSearchResult {
  // 1. Filter by price
  let filtered = rawVehicles.filter(v =>
    !criteria.maxPrice || v.rates.dailyRates.amount <= criteria.maxPrice
  );
  
  // 2. Filter by seats (floor limit)
  filtered = filtered.filter(v =>
    !criteria.minSeats || v.car.seats >= criteria.minSeats
  );
  
  // 3. Filter by vehicle type
  filtered = filtered.filter(v =>
    !criteria.vehicleType || v.car.carType === criteria.vehicleType
  );
  
  // 4. Filter by transmission
  filtered = filtered.filter(v =>
    !criteria.transmission || v.car.transmissionType === criteria.transmission
  );
  
  // 5. Filter by fuel type
  filtered = filtered.filter(v =>
    !criteria.fuelType || v.car.fuelType === criteria.fuelType
  );
  
  // 6. Sort by rating (highest first)
  filtered.sort((a, b) => {
    const ratingA = a.ratingsReceivedFrom > 0 ? a.totalRatings / a.ratingsReceivedFrom : 0;
    const ratingB = b.ratingsReceivedFrom > 0 ? b.totalRatings / b.ratingsReceivedFrom : 0;
    return ratingB - ratingA;
  });
  
  // 7. Take top 5
  const top5 = filtered.slice(0, 5);
  
  // 8. Mask each result (keep only essential fields)
  const masked = top5.map(maskSearchResult);
  
  return {
    total_raw: rawVehicles.length,
    total_matching: filtered.length,
    shown: masked,
    filters_applied: criteria
  };
}

function maskSearchResult(vehicle: TSearchedCar): MaskedSearchResult {
  const rating = vehicle.ratingsReceivedFrom > 0
    ? (vehicle.totalRatings / vehicle.ratingsReceivedFrom).toFixed(1)
    : 'New';
  
  return {
    listingId: vehicle.listingId,
    make: vehicle.car.make,
    model: vehicle.car.model,
    year: vehicle.car.year || 0,
    carType: vehicle.car.carType,
    transmission: vehicle.car.transmissionType,
    fuelType: vehicle.car.fuelType,
    seats: vehicle.car.seats,
    dailyRate: vehicle.rates.dailyRates.amount,
    hourlyRate: vehicle.rates.hourlyRates.amount,
    city: vehicle.location.pickupAddress.city,
    totalTrips: vehicle.totalTrips,
    rating: vehicle.ratingsReceivedFrom > 0
      ? `${rating} (${vehicle.ratingsReceivedFrom} reviews)`
      : 'New listing'
  };
}
```

**Token Reduction:**
- Raw `TSearchedCar[]` (30 vehicles): ~12,500 tokens
- `FilteredSearchResult` (5 masked): ~750 tokens
- **Savings: 94%**

---

#### Detail Masking
```typescript
function maskVehicleDetails(raw: TCarDataState): MaskedVehicleDetails {
  const hostRating = raw.hostInfo.hostRatingCount > 0
    ? (raw.hostInfo.hostRatingTotal / raw.hostInfo.hostRatingCount).toFixed(2)
    : 'New';
  
  return {
    listingId: raw.listingId,
    make: raw.car.make,
    model: raw.car.model,
    year: raw.car.year,
    carType: raw.car.carType,
    seats: raw.car.seats,
    transmission: raw.car.transmissionType,
    fuelType: raw.car.fuelType,
    mileage: raw.car.mileage,
    features: raw.features.slice(0, 8),  // Top 8 only
    description: stripHtml(raw.additionalInfos.carDescription),  // Strip HTML tags
    guidelines: stripHtml(raw.additionalInfos.guidelines),
    rates: {
      hourly: raw.rates.hourlyRates.amount,
      daily: raw.rates.dailyRates.amount,
      peak_info: summarizePeakPricing(raw.rates.peakIncrease),
      long_booking_discount: summarizeLongDiscount(raw.rates.longBookingDiscounts)
    },
    distance_limits: {
      unlimited: raw.distance.unlimitedTravel,
      daily_km: raw.distance.unlimitedTravel ? undefined : raw.distance.maximumDailyDistance,
      fee_per_extra_km: raw.distance.unlimitedTravel ? undefined : raw.distance.additionalFeePerKilometer
    },
    availability_summary: {
      notice_hours: raw.availability.noticeInAdvance.alwaysAvailableImmediately
        ? undefined
        : raw.availability.noticeInAdvance.hoursRequired,
      min_duration: raw.availability.minTripDuration.noMinimum
        ? undefined
        : `${raw.availability.minTripDuration.shortestDuration} ${raw.availability.minTripDuration.unit}`,
      max_duration: raw.availability.maxTripDuration.noMaximum
        ? undefined
        : `${raw.availability.maxTripDuration.longestDuration} ${raw.availability.maxTripDuration.unit}`
    },
    host: {
      firstName: raw.hostInfo.firstName,
      totalTrips: raw.hostInfo.hostTotalTrips,
      rating: raw.hostInfo.hostRatingCount > 0
        ? `${hostRating} (${raw.hostInfo.hostRatingCount} reviews)`
        : 'New host'
    },
    location: {
      city: raw.location.pickupAddress.city,
      street: raw.location.pickupAddress.street,
      parking_instructions: raw.location.parkingInstructions
    },
    cover_photo_url: raw.photos.coverPhoto.imageInfo.secure_url
  };
}
```

**Token Reduction:**
- Raw `TCarDataState`: ~5,000 tokens
- `MaskedVehicleDetails`: ~500 tokens
- **Savings: 90%**

---

## 9. Service Flows — Critical Paths

### 9.1 Vehicle Search & Availability Query

**User Flow:**
1. User enters location + pickup/return datetime on `/search` page
2. Frontend calls `GET /search/find-cars?city=Sydney&from=...&to=...`
3. Backend: geo-query `carListings` collection, filters by `listingStatus='listed'`
4. Backend applies availability rules (pickup/return hour constraints)
5. Returns `TSearchedCar[]` (partial projection — rates, location, car info, cover photo only)
6. User selects a vehicle → frontend calls `GET /search/find-cars/:listingId`
7. Backend returns full `CarDataState` (public fields) + `hostInfo`
8. Frontend calls `GET /reservation/block-dates-by-car/:carListingId`
9. Backend returns `TBlockDatesResponse` (allDayList + customList)
10. Frontend splits into all-day vs. custom blocks
11. Frontend runs `verifyConfirmReservationAvailability()` (6-step validation — see §12)
12. If all checks pass → enable "Confirm Reservation" button

**AI Chatbot Flow:**
1. User sends "Show me SUVs in Sydney for Aug 15-18"
2. Widget sends to `/api/ai/chat/stream`
3. Orchestrator calls `search_vehicles` tool:
   ```json
   {
     "city": "Sydney",
     "country": "au",
     "region": "nsw",
     "cType": "SUV",
     "from": "2026-08-15T03:00:00.000Z",
     "to": "2026-08-18T03:00:00.000Z"
   }
   ```
4. Adapter calls `GET /search/find-cars` with generous `pageSize=30`
5. Filter engine applies `cType='SUV'` filter + sorts by rating
6. Returns `FilteredSearchResult` (top 5 masked vehicles, ~750 tokens)
7. LLM synthesizes natural language response:
   ```
   I found 8 SUVs available in Sydney for Aug 15-18. Here are the top 5:
   
   1. 2022 Toyota RAV4 — $89/day, Automatic Petrol, 5 seats
      Rating: 4.8 (12 reviews) | 45 trips completed
   
   2. 2023 Mazda CX-5 — $95/day, Automatic Petrol, 5 seats
      Rating: 4.9 (8 reviews) | 32 trips completed
   
   ...
   
   Would you like details on any of these?
   ```
8. User replies "Tell me about the RAV4"
9. Orchestrator calls `get_vehicle_details` tool with `listingId=1022`
10. Adapter calls `GET /search/find-cars/1022`
11. Masker strips HTML, truncates features, summarizes pricing
12. Returns `MaskedVehicleDetails` (~500 tokens)
13. LLM synthesizes detailed response with features, guidelines, host info
14. User asks "Is it available for my dates?"
15. Orchestrator calls `check_availability` tool with `carListingId=1022`
16. Adapter calls `GET /reservation/block-dates-by-car/1022`
17. Returns block dates (none overlap with Aug 15-18)
18. LLM confirms "Yes, it's available! Ready to book?"
19. User says "Yes" → LLM provides deep link to Tashus checkout page with pre-filled params

**Critical:** The AI **never creates the reservation**. It only provides information and a link to the authenticated frontend checkout flow.

---

### 9.2 Reservation Creation (Frontend-Only)

**This flow happens ONLY in the authenticated Tashus frontend. The AI chatbot provides information but never executes this.**

```
1. [Checkout Page] User clicks "Confirm Reservation"
   Frontend: verifyConfirmReservationAvailability() → all 6 checks pass
   
2. [Checkout Page] Assemble SaveNewReservationParams:
   {
     guestId, hostId, carListingId, startDate, endDate,
     basePrice: { durationPrice, serviceFeeAmount, peakIncrease, discounts, ... },
     depositAmount, insurance, paymentMethod, additionalPaymentInfo,
     discounts: { advanceBookingDiscounts, longBookingDiscounts },
     peakIncrease: { increaseDays, increaseType, calculatedAmount },
     additionalDrivers, isDeliveryEnabled, origin: 'web'
   }
   
3. [Frontend] POST /reservation/create { ...params }
   Backend: saves Reservation document, links to CarListing & User
   Sets reservationStatus='pending', paymentStatus='pending'
   Returns: { data: { reservationId: 10042 } }
   
4. [Frontend] Route based on paymentMethod:
   
   ├─ 'onlyVoucher' | 'onlyCredit'
   │   └─ Redirect to /dashboard/:guestId/travels/details/:reservationId
   │      (No card charge, immediate confirmation)
   
   ├─ 'onlyCreditWithHold' | 'onlyVoucherWithHold'
   │   ├─ holdDepositCredit > 0 → /dashboard/:guestId/travels/details/:reservationId
   │   └─ else                  → /payment/holdAmount/:reservationId?from=checkout
   
   └─ 'cardWithVoucher' | 'cardWithCredit' | 'onlyCard'
       └─ Redirect to /search/:vehicleId/payment/:reservationId?from=checkout
   
5. [Payment Page] Stripe flow:
   
   ├─ Immediate charge: POST /payment/stripe-element
   │   body: { paymentData: IPayment, price, holdPrice, email }
   │   Returns: { clientSecret, paymentIntentId, status }
   │   Frontend: confirmPayment() via Stripe.js
   
   ├─ Hold + charge: POST /payment/stripe-hold-with-payment
   │   (Same flow, creates PaymentIntent with both amounts)
   
   └─ Hold only: POST /payment/stripe-hold-only
       (Creates authorization hold, no immediate charge)
   
6. [Stripe Webhook] Backend receives payment_intent.succeeded
   Updates Reservation: reservationStatus='confirmed', paymentStatus='paid'
   
7. [Frontend] Redirect to /dashboard/:guestId/travels/details/:reservationId
   Displays "Booking Confirmed" with trip details
```

**AI Chatbot Role:** Provides information, answers questions, confirms availability. When user says "book it", the AI provides a deep link to the Tashus checkout page with pre-filled query params (e.g. `/search/:vehicleId/checkout?from=...&to=...`). The user must authenticate and complete the checkout flow manually.

---

### 9.3 Voucher Validation (Frontend + AI)

**Frontend Flow (Checkout):**
```
1. User enters voucher code "SUMMER25" in checkout form
2. Frontend: useCheckVoucherValidation() hook
3. PUT /v2/voucher/validate-voucher
   body: {
     userId, voucherCode, totalAmount,
     additionalData: {
       carListingId, reservationDuration,
       travelStartDate, travelEndDate, guestEmail
     }
   }
4. Backend checks:
   a. Voucher exists, voucherCode matches (case-insensitive)
   b. isActive=true, isPaused=false, isExpired=false
   c. activateAt <= now <= expiresAt
   d. voucherUsageCount < maxUsageCount
   e. User's usage count < maxUsagePerUser
   f. ALL voucherRules pass (rules engine against additionalData)
      Example rules:
      - carListingId in [allowed_ids]
      - reservationDuration >= 72 (hours)
      - travelStartDate.month == 'december'
      - user.emailVerified == true
   
5. Backend returns:
   {
     success: true,
     message: "Voucher applied successfully",
     responseObject: {
       isVoucherValid: true,
       discountAmount: 40.00,
       discountType: "percentage",
       totalAfterDiscount: 240.50,
       voucherCode: "SUMMER25",
       voucherId: "64abc1234ef567890abcdef"
     }
   }
   
6. Frontend: setAppliedVoucherInfo({ ...responseObject })
   Updates displayed total price
   
7. On reservation create: includes additionalPaymentInfo.voucherCode/voucherAmountUsed
```

**AI Chatbot Flow:**
```
1. User asks "What's SUMMER25?" or "Do I have any vouchers?"
2. Orchestrator calls validate_voucher tool:
   { voucherSlug: "SUMMER25" }
3. Adapter calls GET /v2/voucher/slug/SUMMER25
4. Returns full TVoucher object (see §4.5)
5. LLM synthesizes:
   "SUMMER25 gives you 20% off (max $50) on SUV and Sedan bookings
    for trips of 3+ days in December 2026. Valid until Dec 31, 2026.
    You've used it 0 times (limit: 1 per user)."
6. User asks "Can I use it for the RAV4?"
7. LLM checks voucherRules against known reservation details:
   - carType='SUV' ✓
   - reservationDuration=72 hrs ✓
   - monthOfTravel='august' ✗ (rule requires 'december')
8. LLM responds:
   "Unfortunately, SUMMER25 only applies to December bookings.
    Your Aug 15-18 trip doesn't qualify. Would you like to search
    for December availability instead?"
```

**Critical:** The AI **never applies the voucher**. It only explains eligibility. Actual voucher redemption happens server-side during `POST /reservation/create` after frontend validation.

---

### 9.4 Human Handoff Circuit Breaker

**Trigger:** User says "I want to speak to a human" or agent detects escalation need.

```
1. [Widget] User clicks "Speak to a Human" button or sends message
2. [Widget] POST /api/ai/session/:id/request-handoff
   body: { userId?, message: "User requested human assistance" }
3. [Backend] Updates session:
   - is_ai_paused = true  (CIRCUIT BREAKER — AI will not respond)
   - status = 'handed_off'
   - metadata.handoff_reason = message
4. [Backend] Publishes to two Redis channels:
   - `session:{sessionId}:control` → `{ type: 'control', paused: true, message: { role: 'system', content: '🤝 Connecting...' } }`
   - `admin:notifications` → `{ type: 'handoff_requested', session_id, visitor_id, reason, timestamp }`
5. [Admin Dashboard] SSE listener at `/api/admin/notifications/stream`
   Receives `handoff_requested` event → silent `fetchSessions(true)` refresh, orange badge on Handoff tab
6. [Admin] Clicks session in list → `InlineChatPanel` loads via `GET /api/admin/sessions/:id`
7. [Admin] Clicks "Take Over" → `POST /api/admin/sessions/:id/takeover`
   Sets `assigned_admin_id = admin.userId` immediately on takeover (not deferred to first message)
8. [Admin] Sends message → `POST /api/admin/sessions/:id/messages`
   Inserts `ai_chat_messages (role='admin', sent_by_admin_id)`
   Publishes `{ type: 'message', message: { role: 'admin', content, admin_display_name, ... } }` to `session:{id}:control`
9. [Widget] SSE `/api/ai/session/:id/stream`
   Receives `type: 'message'` → renders admin bubble in chat
10. [Orchestrator] Each subsequent user message → circuit breaker check:
    `is_ai_paused = true` → user message saved, yield `{ type: 'done' }`, return immediately
11. [Admin] Clicks "Resume AI" → `POST /api/admin/sessions/:id/release`
    Sets `is_ai_paused = false`, `status = 'active'`, `assigned_admin_id = null`
    Publishes `{ type: 'control', paused: false }` to `session:{id}:control`
12. Next user message → Orchestrator circuit breaker: `is_ai_paused = false` → normal LLM flow resumes
```

**Critical:** The `is_ai_paused` flag is checked **before every LLM call**. When true, the orchestrator immediately returns without generating a response. This is the circuit breaker that ensures human admins have full control during handoff.

---

## 10. Payload Examples — JSON Contracts

### 10.1 Create Reservation Request
`POST /reservation/create`

```json
{
  "guestId": "64f3a1b2c8d9e00012345678",
  "hostId": "64f3a1b2c8d9e000abcdef01",
  "carListingId": 142,
  "startDate": "2026-08-15T03:00:00.000Z",
  "endDate": "2026-08-18T03:00:00.000Z",
  "totalDurationHours": 72,
  "totalDistanceKm": 300,
  "dailyDistanceKm": 100,
  "additionalDistanceFeePerKm": 0.35,
  "depositAmount": 500,
  "serviceFeePercentage": 10,
  "basePrice": {
    "dailyPrice": 85,
    "hourlyPrice": 12,
    "durationPrice": 255,
    "totalPrice": 280.50,
    "currency": "AUD",
    "serviceFeeAmount": 28.05,
    "coverageAmount": 0,
    "gstAmount": 0
  },
  "insurance": {
    "guestCoverageType": "standard",
    "coveragePercentage": 70,
    "excessFee": 1500
  },
  "pickupLocation": {
    "coordinates": [151.2093, -33.8688],
    "shortAddress": "Sydney NSW",
    "streetAddress": "123 George St, Sydney NSW 2000"
  },
  "dropOffLocation": {
    "coordinates": [151.2093, -33.8688],
    "shortAddress": "Sydney NSW",
    "streetAddress": "123 George St, Sydney NSW 2000"
  },
  "paymentMethod": "cardWithVoucher",
  "additionalPaymentInfo": {
    "cardAmountUsed": 240.50,
    "voucherCode": "SUMMER25",
    "voucherAmountUsed": 40.00,
    "voucherId": "64abc1234ef567890abcdef",
    "creditAmountUsed": 0
  },
  "discounts": {
    "longBookingDiscounts": {
      "calculatedAmount": 25.50,
      "text": "10% off for 3+ days",
      "duration": 3,
      "durationUnit": "days",
      "percentage": 10
    }
  },
  "peakIncrease": {
    "increaseDays": ["sat", "sun"],
    "increaseType": "percentage",
    "increaseAmount": 15,
    "calculatedAmount": 25.50
  },
  "additionalDrivers": [],
  "isDeliveryEnabled": false,
  "isReturnEnabled": false,
  "origin": "web"
}
```

---

### 10.2 Voucher Validate Request (v2)
`PUT /v2/voucher/validate-voucher`

```json
{
  "userId": "64f3a1b2c8d9e00012345678",
  "voucherCode": "SUMMER25",
  "totalAmount": 280.50,
  "additionalData": {
    "carListingId": 142,
    "reservationDuration": 72,
    "travelStartDate": "2026-08-15T03:00:00.000Z",
    "travelEndDate": "2026-08-18T03:00:00.000Z",
    "guestEmail": "guest@example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voucher applied successfully",
  "responseObject": {
    "isVoucherValid": true,
    "discountAmount": 40.00,
    "discountType": "percentage",
    "totalAfterDiscount": 240.50,
    "voucherCode": "SUMMER25",
    "voucherId": "64abc1234ef567890abcdef"
  }
}
```

---

### 10.3 Block-Dates Response
`GET /reservation/block-dates-by-car/:carListingId`

```json
{
  "allDayList": [
    {
      "_id": "64b1234567890abcdef12301",
      "title": "Blocked",
      "start": "2026-08-10T00:00:00.000Z",
      "end": "2026-08-10T23:59:59.000Z",
      "createdAt": "2026-07-01T05:00:00.000Z"
    }
  ],
  "customList": [
    {
      "_id": "64b1234567890abcdef12302",
      "title": "Custom Block",
      "start": "2026-08-20T08:00:00.000Z",
      "end": "2026-08-20T18:00:00.000Z",
      "createdAt": "2026-07-10T05:00:00.000Z"
    }
  ]
}
```

---

### 10.4 Search Vehicles Response (Masked)
AI Agent Tool Result

```json
{
  "total_raw": 30,
  "total_matching": 8,
  "shown": [
    {
      "listingId": 1022,
      "make": "Toyota",
      "model": "RAV4",
      "year": 2022,
      "carType": "SUV",
      "transmission": "Automatic",
      "fuelType": "Petrol",
      "seats": 5,
      "dailyRate": 89.0,
      "hourlyRate": 12.5,
      "city": "Sydney",
      "totalTrips": 45,
      "rating": "4.8 (12 reviews)"
    },
    {
      "listingId": 1087,
      "make": "Mazda",
      "model": "CX-5",
      "year": 2023,
      "carType": "SUV",
      "transmission": "Automatic",
      "fuelType": "Petrol",
      "seats": 5,
      "dailyRate": 95.0,
      "hourlyRate": 13.0,
      "city": "Sydney",
      "totalTrips": 32,
      "rating": "4.9 (8 reviews)"
    }
  ],
  "filters_applied": {
    "cType": "SUV",
    "minSeats": null,
    "maxPrice": null
  }
}
```

---

### 10.5 Vehicle Details Response (Masked)
AI Agent Tool Result

```json
{
  "listingId": 1022,
  "make": "Toyota",
  "model": "RAV4",
  "year": 2022,
  "carType": "SUV",
  "seats": 5,
  "transmission": "Automatic",
  "fuelType": "Petrol",
  "mileage": { "distance": 25000, "units": "km" },
  "features": [
    "Air Conditioning",
    "Bluetooth",
    "GPS Navigation",
    "Reverse Camera",
    "Apple CarPlay",
    "Cruise Control",
    "Parking Sensors",
    "USB Ports"
  ],
  "description": "Well-maintained 2022 Toyota RAV4 perfect for city driving and weekend adventures. Recently serviced with new tires.",
  "guidelines": "Please return with same fuel level. No smoking. No pets. Maximum 3 additional drivers.",
  "rates": {
    "hourly": 12.5,
    "daily": 89.0,
    "peak_info": "15% surcharge on weekends (Fri-Sun)",
    "long_booking_discount": "10% off for 7+ days"
  },
  "distance_limits": {
    "unlimited": false,
    "daily_km": 200,
    "fee_per_extra_km": 0.35
  },
  "availability_summary": {
    "notice_hours": 2,
    "min_duration": "3 hours",
    "max_duration": "7 days"
  },
  "host": {
    "firstName": "John",
    "totalTrips": 156,
    "rating": "4.78 (45 reviews)"
  },
  "location": {
    "city": "Sydney",
    "street": "123 George Street",
    "parking_instructions": "Level 2 of parking garage, bay 15. Use intercom at entrance."
  },
  "cover_photo_url": "https://res.cloudinary.com/tashus/image/upload/v1/vehicles/abc123.jpg"
}
```

---

## 11. Frontend State Management

### SearchProvider (`src/context/SearchProvider.tsx`)

**Central hub for search-to-checkout flow.** Persists across vehicle search → detail → checkout → payment pages.

| State Key | Type | Purpose |
|---|---|---|
| `searchParams` | `SearchParamsType` | Location + pickup/return datetime inputs |
| `searchedCarList` | `TSearchedCar[]` | Raw API results from `/search/find-cars` |
| `filteredCarList` | `TSearchedCar[]` | After applying frontend filters |
| `singleCarBlockDates` | `TSingleCarBlockDate` | allDayList + customList (from block-dates API) |
| `singleCarReservationList` | `TVehicleReservation[]` | Confirmed/pending reservations for selected vehicle |
| `totalPrice` | `number` | Final computed price (post-discounts, post-fees) |
| `durationPrice` | `number` | Base price before discounts/fees |
| `peakIncPrice` | `TPeakIncreasePrice` | Peak surcharge breakdown |
| `discountedPrice` | `DiscountedPriceType` | long + advance discount breakdown |
| `serviceFee` | `number` | Platform fee (10% of totalPrice) |
| `reservationPriceList` | `ReservationPriceListType[]` | Per-day price breakdown |
| `guestCoveragePackage` | `TGuestInsurance` | Selected insurance tier |
| `additionalPaymentInfo` | `any` | Voucher + credit amounts |
| `appliedVoucherInfo` | `TAppliedVoucherInfo \| null` | Validated voucher (from server) |
| `appliedCreditInfo` | `TAppliedCreditInfo \| null` | Applied credit balance |
| `paymentMethod` | `TPaymentMethods` | Selected payment combination |
| `vehicleDeliveryInfo` | `VehicleDeliveryInfoState` | Delivery location + fee |
| `guestVerificationFlags` | `TGuestVerificationFlags` | Verification status (gates checkout) |
| `reservationCustomPriceList` | `ICustomPricing[]` | Custom per-day pricing overrides |

**Key Method:** `verifyConfirmReservationAvailability()`  
Runs **6-step validation** (see §12) before allowing checkout progression.

---

## 12. Availability Validation Logic

**File:** `src/utils/Functions/reservationValidationFn.tsx`  
**Called from:** `SearchProvider.verifyConfirmReservationAvailability()`

### 6-Step Validation Sequence

```typescript
async function verifyConfirmReservationAvailability() {
  const { 
    pickupDateTime, returnDateTime, 
    carAvailability, singleCarBlockDates, singleCarReservationList 
  } = this.state;
  
  // STEP 1: Existing Reservation Conflict Check
  const existingReservations = singleCarReservationList.filter(res => 
    !['cancelledByGuest', 'cancelledByHost', 'cancelled'].includes(res.reservationStatus)
  );
  
  for (const res of existingReservations) {
    const resStart = dayjs(res.startDate).subtract(29, 'minutes');
    const resEnd = dayjs(res.endDate).add(29, 'minutes');
    
    const isOverlap = 
      dayjs(pickupDateTime).isBetween(resStart, resEnd, null, '[]') ||
      dayjs(returnDateTime).isBetween(resStart, resEnd, null, '[]') ||
      dayjs(res.startDate).isBetween(pickupDateTime, returnDateTime, null, '[]') ||
      dayjs(res.endDate).isBetween(pickupDateTime, returnDateTime, null, '[]');
    
    if (isOverlap) {
      this.setState({ 
        availabilityError: 'Reserved on selected time',
        isAvailable: false 
      });
      return false;
    }
  }
  
  // STEP 2: Custom Block Date Conflict Check
  const customBlockDates = singleCarBlockDates.customList.filter(block => 
    dayjs(block.end).isAfter(dayjs())  // Skip past blocks
  );
  
  for (const block of customBlockDates) {
    const isOverlap = 
      dayjs(pickupDateTime).isBetween(block.start, block.end, null, '[]') ||
      dayjs(returnDateTime).isBetween(block.start, block.end, null, '[]') ||
      dayjs(block.start).isBetween(pickupDateTime, returnDateTime, null, '[]') ||
      dayjs(block.end).isBetween(pickupDateTime, returnDateTime, null, '[]');
    
    if (isOverlap) {
      this.setState({ 
        availabilityError: `Unavailable on ${dayjs(block.start).format('MMM DD')}, from ${dayjs(block.start).format('HH:mm')} to ${dayjs(block.end).format('HH:mm')}`,
        isAvailable: false 
      });
      return false;
    }
  }
  
  // STEP 3: Notice in Advance Check
  if (!carAvailability.noticeInAdvance.alwaysAvailableImmediately) {
    const hoursRequired = carAvailability.noticeInAdvance.hoursRequired;
    const advanceTimeDiffInMin = dayjs(pickupDateTime).diff(dayjs(), 'minutes');
    
    if (advanceTimeDiffInMin < hoursRequired * 60) {
      this.setState({ 
        availabilityError: `${hoursRequired} hour(s) notice period is required`,
        isAvailable: false 
      });
      return false;
    }
  }
  
  // STEP 4: Minimum Trip Duration Check
  if (!carAvailability.minTripDuration.noMinimum) {
    const { unit, shortestDuration } = carAvailability.minTripDuration;
    const timeDiffHours = dayjs(returnDateTime).diff(dayjs(pickupDateTime), 'hours');
    const timeDiffDays = dayjs(returnDateTime).diff(dayjs(pickupDateTime), 'days');
    const timeDiffMins = dayjs(returnDateTime).diff(dayjs(pickupDateTime), 'minutes');
    
    let isTooShort = false;
    if (unit === 'hours' && timeDiffHours < shortestDuration) isTooShort = true;
    if (unit === 'days' && timeDiffDays < shortestDuration) isTooShort = true;
    if (unit === 'weeks' && timeDiffMins < shortestDuration * 7 * 24 * 60) isTooShort = true;
    
    if (isTooShort) {
      this.setState({ 
        availabilityError: `Reservation needs to be for minimum ${shortestDuration} ${unit}`,
        isAvailable: false 
      });
      return false;
    }
  }
  
  // STEP 5: Maximum Trip Duration Check
  if (!carAvailability.maxTripDuration.noMaximum) {
    const { unit, longestDuration } = carAvailability.maxTripDuration;
    const timeDiffMins = dayjs(returnDateTime).diff(dayjs(pickupDateTime), 'minutes');
    
    let isTooLong = false;
    if (unit === 'days' && timeDiffMins > longestDuration * 24 * 60) isTooLong = true;
    if (unit === 'weeks' && timeDiffMins > longestDuration * 7 * 24 * 60) isTooLong = true;
    
    if (isTooLong) {
      this.setState({ 
        availabilityError: `Reservations must not exceed ${longestDuration} ${unit}`,
        isAvailable: false 
      });
      return false;
    }
  }
  
  // STEP 6: Custom Pickup/Return Hour Check
  if (!carAvailability.pickupReturnHour.alwaysAvailable) {
    const customAvailability = carAvailability.pickupReturnHour.customAvailability;
    
    // Build date range between pickup and return
    const dateRange = [];
    let current = dayjs(pickupDateTime).startOf('day');
    const end = dayjs(returnDateTime).startOf('day');
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      dateRange.push(current);
      current = current.add(1, 'day');
    }
    
    // Check each date
    for (const date of dateRange) {
      const dayOfWeek = date.format('ddd').toLowerCase();  // 'mon', 'tue', ...
      const rule = customAvailability.find(r => r.dayOfWeek === dayOfWeek);
      
      if (!rule) continue;
      
      if (rule.availability === 'never') {
        this.setState({ 
          availabilityError: `Unavailable on ${dayOfWeek}`,
          isAvailable: false 
        });
        return false;
      }
      
      if (rule.availability === 'custom') {
        // Check if pickup/return time falls within a 'free' slot
        const isPickupDay = date.isSame(dayjs(pickupDateTime), 'day');
        const isReturnDay = date.isSame(dayjs(returnDateTime), 'day');
        
        if (isPickupDay) {
          const pickupTime = dayjs(pickupDateTime);
          const hasValidSlot = rule.customHours.some(slot => 
            slot.status === 'free' && 
            pickupTime.isBetween(dayjs(slot.startTime), dayjs(slot.endTime), null, '[]')
          );
          
          if (!hasValidSlot) {
            this.setState({ 
              availabilityError: `Pickup unavailable for selected time on ${dayOfWeek}`,
              isAvailable: false 
            });
            return false;
          }
        }
        
        if (isReturnDay) {
          const returnTime = dayjs(returnDateTime);
          const hasValidSlot = rule.customHours.some(slot => 
            slot.status === 'free' && 
            returnTime.isBetween(dayjs(slot.startTime), dayjs(slot.endTime), null, '[]')
          );
          
          if (!hasValidSlot) {
            this.setState({ 
              availabilityError: `Return unavailable for selected time on ${dayOfWeek}`,
              isAvailable: false 
            });
            return false;
          }
        }
      }
    }
  }
  
  // ALL CHECKS PASSED
  this.setState({ 
    availabilityError: null,
    isAvailable: true 
  });
  return true;
}
```

---

## 13. Price Calculation Pipeline

**File:** `src/utils/Functions/reservationValidationFn.tsx`  
**Function:** `calculateDurationPrice2()`

### Pricing Formula (Step-by-Step)

```typescript
function calculateDurationPrice2(
  startDate: Date,
  endDate: Date,
  dailyRates: number,
  hourlyRates: number,
  peakIncrease: TPeakIncrease[],
  longBookingDiscounts: TLongBookingDiscount[],
  advanceBookingDiscounts: TAdvanceBookingDiscount[],
  customPricing: ICustomPricing[]
) {
  // STEP 1: Base Duration Price
  const timeDiffMins = dayjs(endDate).diff(dayjs(startDate), 'minutes');
  const timeDiffHours = Math.floor(timeDiffMins / 60);
  const timeDiffDays = Math.floor(timeDiffHours / 24);
  const remainingHours = timeDiffHours % 24;
  const remainingMins = timeDiffMins % 60;
  
  // Round up remaining hours if there are leftover minutes
  const addedHours = remainingHours + (remainingMins > 0 ? 1 : 0);
  
  // Cap remaining hours price at daily rate (never pay more than daily for partial day)
  const remainingHoursPrice = Math.min(addedHours * hourlyRates, dailyRates);
  
  let durationPrice = (timeDiffDays * dailyRates) + remainingHoursPrice;
  
  // Apply custom pricing overrides for specific dates
  if (customPricing && customPricing.length > 0) {
    let customDurationPrice = 0;
    let current = dayjs(startDate).startOf('day');
    const end = dayjs(endDate);
    
    while (current.isBefore(end)) {
      const dateStr = current.format('YYYY-MM-DD');
      const override = customPricing.find(cp => dayjs(cp.date).format('YYYY-MM-DD') === dateStr);
      
      if (override) {
        // Use override rates for this day
        customDurationPrice += override.updatedDailyRates;
      } else {
        // Use base rates
        customDurationPrice += dailyRates;
      }
      
      current = current.add(1, 'day');
    }
    
    // Add remaining hours using last applicable rate
    customDurationPrice += remainingHoursPrice;
    durationPrice = customDurationPrice;
  }
  
  let totalPrice = durationPrice;
  
  // STEP 2: Peak Increase
  let peakIncreasePrice = 0;
  if (peakIncrease && peakIncrease.length > 0) {
    const matchedPeakDays = [];
    let current = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).startOf('day');
    
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const dayOfWeek = current.format('ddd').toLowerCase();  // 'mon', 'tue', ...
      
      peakIncrease.forEach(peak => {
        if (peak.dayOfWeek === dayOfWeek || peak.increaseDays?.includes(dayOfWeek)) {
          matchedPeakDays.push({ date: current, peak });
        }
      });
      
      current = current.add(1, 'day');
    }
    
    if (matchedPeakDays.length > 0) {
      const highestPeak = peakIncrease.reduce((max, p) => 
        (p.increaseAmount > max.increaseAmount) ? p : max
      );
      
      if (highestPeak.increaseType === 'percentage') {
        peakIncreasePrice = dailyRates * (highestPeak.increaseAmount / 100) * matchedPeakDays.length;
      } else {
        peakIncreasePrice = highestPeak.increaseAmount * matchedPeakDays.length;
      }
      
      totalPrice += peakIncreasePrice;
    }
  }
  
  // STEP 3: Service Fee (10% of total so far)
  const serviceFee = totalPrice * 0.10;
  
  // STEP 4: Long Booking Discount
  let longBookingDiscount = 0;
  if (longBookingDiscounts && longBookingDiscounts.length > 0) {
    // Convert all discounts to days for comparison
    const normalizedDiscounts = longBookingDiscounts.map(d => ({
      ...d,
      convertedDays: d.unit === 'weeks' ? d.value * 7 : d.value
    }));
    
    // Filter to qualifying discounts
    const qualifyingDiscounts = normalizedDiscounts.filter(d => 
      timeDiffDays >= d.convertedDays
    );
    
    if (qualifyingDiscounts.length > 0) {
      // Pick highest discount (longest duration requirement)
      const highestDiscount = qualifyingDiscounts.reduce((max, d) => 
        d.convertedDays > max.convertedDays ? d : max
      );
      
      longBookingDiscount = totalPrice * (highestDiscount.percentage / 100);
      totalPrice -= longBookingDiscount;
    }
  }
  
  // STEP 5: Advance Booking Discount
  let advanceBookingDiscount = 0;
  if (advanceBookingDiscounts && advanceBookingDiscounts.length > 0) {
    const advanceTimeDiffInMin = dayjs(startDate).diff(dayjs(), 'minutes');
    const advanceTimeDiffInDays = Math.floor(advanceTimeDiffInMin / (24 * 60));
    
    // Convert all discounts to days
    const normalizedDiscounts = advanceBookingDiscounts.map(d => ({
      ...d,
      convertedDays: d.unit === 'weeks' ? d.value * 7 : d.value
    }));
    
    // Filter to qualifying discounts
    const qualifyingDiscounts = normalizedDiscounts.filter(d => 
      advanceTimeDiffInDays >= d.convertedDays
    );
    
    if (qualifyingDiscounts.length > 0) {
      const highestDiscount = qualifyingDiscounts.reduce((max, d) => 
        d.convertedDays > max.convertedDays ? d : max
      );
      
      advanceBookingDiscount = totalPrice * (highestDiscount.percentage / 100);
      totalPrice -= advanceBookingDiscount;
    }
  }
  
  return {
    durationPrice,
    totalPrice,
    serviceFee,
    peakIncreasePrice,
    longBookingDiscount,
    advanceBookingDiscount,
    timeDiffDays,
    timeDiffHours,
    remainingHoursPrice
  };
}
```

### Price Breakdown Example

**Scenario:** 3-day rental (Aug 15-18, 2026), $89/day base rate, 15% weekend surcharge, 10% long-booking discount

```
1. Base duration price:
   3 days × $89 = $267.00

2. Peak increase (Sat-Sun in range):
   2 days × $89 × 15% = $26.70
   Subtotal: $293.70

3. Service fee (10%):
   $293.70 × 10% = $29.37
   (stored separately, not added to total yet)

4. Long booking discount (3+ days):
   $293.70 × 10% = -$29.37
   Subtotal: $264.33

5. Final total: $264.33 + $29.37 (service fee) = $293.70
```

---

## 14. Security & Authentication

### 14.1 Frontend Auth (NextAuth v4)

**Storage:**
- Access token: `localStorage.tashus.accessToken` (JWT)
- Refresh token: HTTP-only cookie `next-auth.session-token`

**Flow:**
1. User logs in → NextAuth validates credentials
2. JWT generated with `{ userId, email, role }` payload
3. Access token stored in localStorage
4. Refresh token stored in HTTP-only cookie

**Axios Interceptor (`src/utils/configs/axiosInstance.ts`):**
```typescript
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('tashus.accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // No token → redirect to login
    window.location.href = `/login?return_url=${window.location.pathname}`;
  }
  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized → clear auth state
      localStorage.removeItem('tashus.accessToken');
      document.cookie = 'next-auth.session-token=; Max-Age=0; path=/';
      signOut({ redirect: false });
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);
```

**Middleware (`src/middleware.ts`):**
```typescript
export async function middleware(request: NextRequest) {
  const protectedPaths = [
    '/dashboard/:path*',
    '/car-listing/:path*',
    '/payment/:path*',
    '/on-boarding/driver-verification/:path*'
  ];
  
  const isProtected = protectedPaths.some(path => 
    minimatch(request.nextUrl.pathname, path)
  );
  
  if (isProtected) {
    const token = request.cookies.get('next-auth.session-token');
    if (!token) {
      return NextResponse.redirect(
        new URL(`/login?return_url=${request.nextUrl.pathname}`, request.url)
      );
    }
  }
  
  return NextResponse.next();
}
```

---

### 14.2 AI Backend Auth

**Admin Routes:** Session cookie + JWT validation

```typescript
// src/lib/auth-helpers.ts
export async function getAdminFromRequest(req: NextRequest) {
  const sessionCookie = req.cookies.get('x-admin-session')?.value;
  if (!sessionCookie) {
    throw new Error('Unauthorized — no session cookie');
  }
  
  // Verify Supabase session
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    throw new Error('Invalid session');
  }
  
  // Fetch admin user record
  const { data: admin } = await supabase
    .from('ai_admin_users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  
  if (!admin || !admin.is_active) {
    throw new Error('Admin account inactive');
  }
  
  return admin;
}
```

**Usage:**
```typescript
// In /api/admin/sessions/route.ts
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    // ... proceed with query
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
```

**Local Dev Mode:**
```typescript
export function isLocalDevMode() {
  return process.env.NODE_ENV === 'development' && 
         process.env.SKIP_ADMIN_AUTH === 'true';
}

// In route handlers:
const admin = isLocalDevMode() 
  ? { id: 'dev-admin-id', display_name: 'Dev Admin' }
  : await getAdminFromRequest(req);
```

---

### 14.3 Widget (Anonymous Access)

**No authentication required** — widget API routes are public.

**Visitor ID:** Generated client-side, stored in `localStorage`:
```typescript
const visitorId = localStorage.getItem('tashus_visitor_id') || 
  `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('tashus_visitor_id', visitorId);
```

**Tashus JWT Verification (Optional):**
If user is authenticated on the main Tashus site, the widget can link the session:

```typescript
// POST /api/ai/verify-tashus-token
export async function POST(req: NextRequest) {
  const { sessionId, tashusJwt } = await req.json();
  
  // Verify JWT signature using Tashus JWKS endpoint (configured via TASHUS_JWT_JWKS_URL)
  const decoded = await verifyTashusJwt(tashusJwt);
  
  // Update session with Tashus user info
  await supabase
    .from('ai_chat_sessions')
    .update({
      tashus_user_id: decoded.userId,
      tashus_user_role: decoded.role  // 'guest' | 'host'
    })
    .eq('id', sessionId);
  
  return NextResponse.json({ success: true });
}
```

**Security:** The AI backend **never stores the Tashus JWT** — only extracts `userId` and `role` for read-only linking. The env var is `TASHUS_JWT_JWKS_URL` (public JWKS endpoint), not a shared secret.

---

## 15. Admin Chat Management System

> **Full specification:** `ADMIN_CHAT_MANAGEMENT_PLAN.md`  
> **Last code-verified:** 2026-07-13

### 15.1 Architecture Overview

Two separate Next.js apps share one Supabase database and one Redis bus.

```
AI WIDGET (browser)
  POST /api/ai/session/:id/request-handoff  ──► ai-backend sets is_ai_paused=true
  GET  /api/ai/session/:id/stream           ◄── Redis channel: session:{id}:control

AI BACKEND (ai-backend)
  Orchestrator checks is_ai_paused before every LLM call.
  If true → user message is saved but NO AI reply is generated.

AI ADMIN PANEL (ai-admin)
  Has its own proxy routes under ai-admin/src/app/api/admin/
  These call Supabase and Redis directly — they do NOT proxy through ai-backend.
```

**Critical:** `ai-admin` proxy routes and `ai-backend` admin routes are two separate implementations. The sessions UI (`sessions/page.tsx`) calls only the `ai-admin` proxy routes.

---

### 15.2 Circuit Breaker (`is_ai_paused`)

The `is_ai_paused` boolean on `ai_chat_sessions` is the authoritative circuit breaker.

**In `orchestrator.ts` (`processMessageStream`):**

```typescript
// Checked immediately after inserting the user message:
const { data: sessionState } = await db.from('ai_chat_sessions')
  .select('is_ai_paused, status').eq('id', dbSessionId).single();

if (sessionState?.is_ai_paused) {
  // User message is already saved above.
  // Yield done immediately — NO LLM call, NO assistant message inserted.
  yield { type: 'done', message: '', sources: [] };
  return;
}
```

When `is_ai_paused = true`:
- User messages are still saved to `ai_chat_messages` so the admin sees them
- Zero tokens are spent
- The widget stream closes with a silent `done` event

---

### 15.3 Redis Channels

Defined in `ai-backend/src/lib/redis.ts`:

```typescript
// Widget SSE channel (one per session)
export function buildSessionControlChannel(sessionId: string): string {
  return `session:${sessionId}:control`;
}
// Admin-wide notification channel (broadcast to all connected admins)
// hardcoded: 'admin:notifications'
```

| Channel | Publisher(s) | Subscriber |
|---|---|---|
| `session:{id}:control` | `request-handoff`, `takeover`, `release`, `messages` routes | Widget SSE (`/api/ai/session/:id/stream`) |
| `admin:notifications` | `request-handoff` route | Admin SSE (`/api/admin/notifications/stream`) |

**Payload types on `session:{id}:control`:**

| `type` field | Sent by | Widget action |
|---|---|---|
| `"control"` with `paused: true` | takeover / request-handoff | Show handoff system banner |
| `"control"` with `paused: false` | release | Show "AI resumed" system banner |
| `"message"` | messages route | Render admin message bubble |

---

### 15.4 Admin Panel Routes (ai-admin proxies)

| Method | Route | Action |
|---|---|---|
| GET | `/api/admin/sessions` | List sessions; sort: `is_ai_paused DESC`, `last_message_at DESC` |
| GET | `/api/admin/sessions/:id` | Session detail + full message thread |
| POST | `/api/admin/sessions/:id/takeover` | Sets `is_ai_paused=true`, `status='handed_off'`, `assigned_admin_id=admin.userId`; inserts system message; publishes `{type:'control', paused:true}` |
| POST | `/api/admin/sessions/:id/messages` | Inserts `role='admin'` message; requires `is_ai_paused=true` (returns HTTP 423 otherwise); publishes `{type:'message', message:{...}}` |
| POST | `/api/admin/sessions/:id/release` | Sets `is_ai_paused=false`, `status='active'`, `assigned_admin_id=null`; inserts system message; publishes `{type:'control', paused:false}` |
| PATCH | `/api/admin/sessions/:id` | Sets `status='closed'` |
| GET | `/api/admin/notifications/stream` | SSE — subscribes to `admin:notifications`; sends named events (`event: handoff_requested`) |

**Auth pattern in every proxy route:**
```typescript
async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', role: 'super_admin', displayName: 'Dev Admin' };
  }
  return getAdminFromRequest(req);  // validates session cookie → ai_admin_users
}
```

---

### 15.5 Session Inbox UI (`/sessions`)

**File:** `ai-admin/src/app/(admin)/sessions/page.tsx` (all components inlined, single file)

**Layout — two panels:**
```
┌──────────────────────────┬──────────────────────────────────────────────┐
│ LEFT (width: 280px)       │ RIGHT (flex: 1)                              │
│ bg: #0F161E               │ bg: #090D11                                  │
│                           │                                              │
│ [Active] [Handoff 🔴]     │  IF session selected → InlineChatPanel:      │
│ stats strip               │    Header: visitor_id + status badge         │
│                           │    [● AI Active] or [● Handoff Mode]         │
│ [All Chats] [Handoff 5]   │    Buttons: [Take Over] / [▶ Resume AI]      │
│  tabs                     │             [Close]                          │
│                           │    ──────────────────────────────────────    │
│ [ Search… ]               │    Message thread (scrollable)               │
│                           │    user / assistant / admin / system roles   │
│ Session cards:            │    ──────────────────────────────────────    │
│  avatar + visitor_id      │    Composer (only if is_ai_paused=true):     │
│  last message preview     │    [textarea] [Send]                         │
│  time ago                 │                                              │
│  orange pulsing dot if    │  IF no session selected:                     │
│  is_ai_paused=true        │    "Select a conversation" placeholder       │
└──────────────────────────┴──────────────────────────────────────────────┘
```

**Data refresh:**
- Tab change / search change → `fetchSessions()` (shows loading spinner)
- SSE `handoff_requested` event → `fetchSessions(true)` (silent)
- Auto-poll every **10 seconds** → `fetchSessions(true)` (silent)
- After any action (takeover/release/send) → `fetch_(true)` inside `InlineChatPanel`
- SSE reconnect: 5-second retry on `onerror`

**InlineChatPanel** polls `GET /api/admin/sessions/:id` every **3 seconds**.

**Composer visibility:** rendered only when `is_ai_paused === true && status !== 'closed'`. When AI is active the panel shows: *"AI is active. Click Take Over to respond."*

**Header action button:**
- `is_ai_paused = true` → orange **`▶ Resume AI`** button calls `POST …/release`
- `is_ai_paused = false` → orange **`Take Over`** button calls `POST …/takeover`

---

### 15.6 Handoff Lifecycle

```
ACTIVE (is_ai_paused=false)
   │
   │  User: "I want to speak to a human"
   │  Widget → POST /api/ai/session/:id/request-handoff
   ▼
HANDED_OFF (is_ai_paused=true, status='handed_off')
   │  → Redis admin:notifications → Admin SSE → silent list refresh
   │  → Redis session:control    → Widget shows "🤝 Connecting..." banner
   │
   │  Admin opens session, clicks "Take Over"
   │  POST /api/admin/sessions/:id/takeover
   │  → assigned_admin_id = admin.userId (immediately on takeover)
   │  → system message: "{Admin} has joined. AI is now paused."
   │
   │  Admin types replies
   │  POST /api/admin/sessions/:id/messages  (HTTP 423 if AI not paused)
   │  → Redis type:'message' → Widget renders admin bubble
   │
   │  Admin clicks "Resume AI"
   │  POST /api/admin/sessions/:id/release
   ▼
ACTIVE (is_ai_paused=false, status='active', assigned_admin_id=null)
   │  → system message: "✅ Human agent left. Tashus AI resumed."
   │  → Redis type:'control', paused:false → Widget shows resume banner
   │
   │  Next user message → Orchestrator: is_ai_paused=false → normal LLM flow
```

---

## 16. Deployment & Configuration

### 16.1 Environment Variables

**Source of truth:** `ai-backend/.env.example`

**Frontend (Tashus_Frontend_V1):**
```env
NEXT_PUBLIC_API_URL=https://services.tashus.com/api
NEXTAUTH_URL=https://tashus.com
NEXTAUTH_SECRET=<secret>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

**AI Backend (ai-backend/.env.local):**
```env
# ── Supabase (dedicated AI project — NEVER the Tashus main project) ──
SUPABASE_URL=https://your-ai-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── Redis (Upstash or self-hosted) ───────────────────────────────────
# Used for: rate limiting, BullMQ queues, Tashus adapter cache, pub/sub
REDIS_URL=redis://default:password@host:6379

# ── LLM Provider ─────────────────────────────────────────────────────
# Primary: Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional: Groq (xAI) as primary, comma-separated for key pool rotation
# GROK_API_KEYS=grok-key-1,grok-key-2
# GROK_API_BASE_URL=https://api.x.ai

# ── Embedding Provider ────────────────────────────────────────────────
EMBEDDING_PROVIDER=openai            # openai | voyage | mock
EMBEDDING_PROVIDER_API_KEY=sk-...    # OpenAI or Voyage key
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIMENSION=1536

# ── Tashus Read-Only Adapter ──────────────────────────────────────────
TASHUS_API_BASE_URL=https://api.tashus.com
# TASHUS_JWT_JWKS_URL=https://api.tashus.com/.well-known/jwks.json

# ── Admin Auth ────────────────────────────────────────────────────────
# Min 32 chars. Must match ai-admin JWT_SIGNING_SECRET_ADMIN.
# NEVER reuse Tashus NEXTAUTH_SECRET.
JWT_SIGNING_SECRET_ADMIN=generate-a-32-char-random-secret-here

# ── App ───────────────────────────────────────────────────────────────
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

**AI Admin (ai-admin/.env.local):**
```env
NEXT_PUBLIC_AI_BACKEND_URL=http://localhost:3001   # ai-backend URL
SUPABASE_URL=https://your-ai-project.supabase.co  # same dedicated AI project
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
JWT_SIGNING_SECRET_ADMIN=<same value as ai-backend>
# Local dev — bypass admin auth:
SKIP_ADMIN_AUTH=true
```

**AI Widget (ai-widget):**
```env
VITE_AI_BACKEND_URL=https://ai-backend.tashus.com
```

**Key env notes:**
- `GROK_API_KEYS` is a **comma-separated list** (not `GROQ_API_KEY`) — supports key pool rotation via Token Bucket Manager
- No `DATABASE_URL` — the backend uses the Supabase client directly via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- No `UPSTASH_REDIS_REST_URL` — the backend uses `ioredis` with a standard `REDIS_URL`, not the Upstash REST API
- `SKIP_ADMIN_AUTH=true` enables `isLocalDevMode()` in all admin proxy routes (dev only)

---

### 16.2 Vercel Deployment

**Frontend:**
- Framework: Next.js
- Node.js Version: 18.x
- Build Command: `npm run build`
- Install Command: `npm ci`
- Output Directory: `.next`

**AI Backend:**
- Framework: Next.js
- Node.js Version: 18.x
- Build Command: `npm run build`
- Install Command: `npm ci`
- Output Directory: `.next`
- **Important:** Set `maxDuration: 60` in `/api/ai/chat/stream/route.ts` for Vercel Pro

**AI Admin:**
- Framework: Next.js
- Node.js Version: 18.x
- Build Command: `npm run build`
- Install Command: `npm ci`
- Output Directory: `.next`

**AI Widget:**
- Framework: Vite (React)
- Node.js Version: 18.x
- Build Command: `npm run build`
- Install Command: `npm ci`
- Output Directory: `dist`
- **Deployment:** Upload `dist/tashus-widget.js` to CDN, embed via `<script>` tag

---

## 17. Monitoring & Observability

### 17.1 Key Metrics

**AI Performance:**
- Token consumption (input + output) per session
- Latency per LLM call
- Tool call frequency distribution
- Cache hit rate
- Provider distribution (Anthropic vs Groq)

**System Health:**
- Sessions created per hour
- Messages per session (avg)
- Handoff rate (% sessions requiring human)
- Admin response time (time from handoff to first admin message)
- Session duration (avg)

**Cost Tracking:**
- Token cost per session (tracked in `ai_tool_call_logs.token_cost_usd`)
- Daily/monthly aggregates by provider
- Cost per conversation (tokens_in + tokens_out × provider rate)

### 17.2 Database Queries for Analytics

**Daily Token Usage:**
```sql
SELECT 
  DATE(created_at) as date,
  provider,
  SUM(tokens_in) as total_tokens_in,
  SUM(tokens_out) as total_tokens_out,
  SUM(token_cost_usd) as total_cost_usd,
  COUNT(*) as call_count
FROM ai_tool_call_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date DESC, provider;
```

**Handoff Rate:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'handed_off') * 100.0 / COUNT(*) as handoff_rate_percent,
  COUNT(*) FILTER (WHERE status = 'handed_off') as total_handoffs,
  COUNT(*) as total_sessions
FROM ai_chat_sessions
WHERE started_at >= NOW() - INTERVAL '7 days';
```

**Most Common Tools:**
```sql
SELECT 
  tool_name,
  COUNT(*) as call_count,
  AVG(duration_ms) as avg_duration_ms
FROM ai_tool_call_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY call_count DESC
LIMIT 10;
```

---

## 18. Future Enhancements

### 18.1 Planned Features

1. **Multi-Channel Input**
   - Email ingestion (IMAP listener)
   - Voice calls (Twilio integration)
   - Social media DMs (Facebook, Instagram)

2. **Advanced RAG**
   - Contextual reranking (Cohere API)
   - Query expansion (generate multiple search queries)
   - Hybrid search (keyword + semantic)

3. **Proactive Engagement**
   - Trigger chatbot on specific page events (e.g., 3+ mins on search page with no results)
   - Abandoned cart recovery
   - Post-booking follow-ups

4. **A/B Testing**
   - Multiple system prompts (A/B test conversion rates)
   - Tool availability experiments
   - Model comparison (Claude vs GPT-4 vs Llama)

5. **Admin Dashboard Enhancements**
   - Session replay (step-through message history with tool call inspection)
   - Canned responses (quick replies for common questions)
   - Auto-assignment (route handoffs to specific admins by expertise)

---

## Conclusion

This blueprint captures the complete architectural intelligence of the Tashus AI ecosystem as of 2026-07-13. It serves as the single source of truth for:

- **Data models** — Vehicle, availability, pricing, reservations, vouchers, promotions
- **API contracts** — Every endpoint, request/response payload, authentication pattern
- **Service flows** — Search, booking, voucher validation, handoff, pricing
- **AI orchestration** — Tool registry, RAG pipeline, circuit breaker, token optimization
- **Security** — Read-only adapter, allow-list enforcement, database constraints, auth layers

**Critical Design Principles:**
1. **Read-Only AI** — The AI ecosystem NEVER writes to Tashus production. All mutating operations (create reservation, apply voucher) happen in authenticated frontend flows.
2. **Compliance Proof** — Every tool call is logged with `http_method='GET'` (database constraint enforces this).
3. **Human Oversight** — The `is_ai_paused` circuit breaker gives admins full control during handoffs.
4. **Token Efficiency** — Code-level filtering and masking reduce token consumption by 90-94%.
5. **Separation of Concerns** — AI database is completely separate from Tashus production. No shared tables, no cross-database queries.

**For AI Agents:** Use this document as context when modifying the codebase. All data models, API endpoints, and service flows documented here are the canonical source of truth. When in doubt, refer to this blueprint rather than making assumptions.

---

**Document Version:** 1.0  
**Generated:** 2026-07-13  
**Last Updated:** 2026-07-13  
**Maintainer:** Tashus AI Team

