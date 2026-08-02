# Tashus AI Chatbot — Deployment Plan

> **Scope:** `ai-backend` (Next.js API) + `ai-admin` (Next.js admin panel) + BullMQ workers  
> **Strategy:** Zero cost — Vercel free tier for both Next.js apps, Upstash Redis free tier, Koyeb free tier for the worker process  
> **Goal:** Production deployment with full parity to the current local implementation

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRODUCTION ARCHITECTURE                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  VERCEL (Free Hobby Tier)                                            │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────┐  ┌────────────────────────────────┐ │   │
│  │  │  ai-backend                │  │  ai-admin                      │ │   │
│  │  │  tashus-ai.vercel.app      │  │  tashus-admin.vercel.app       │ │   │
│  │  │                            │  │                                │ │   │
│  │  │  • /api/ai/chat/stream     │  │  • /sessions                   │ │   │
│  │  │  • /api/ai/session/*       │  │  • /documents                  │ │   │
│  │  │  • /api/admin/*            │  │  • /knowledge-base             │ │   │
│  │  │  • /api/ai/ingest          │  │  • /api/admin/* (proxy routes) │ │   │
│  │  │  • SSE streams             │  │                                │ │   │
│  │  └────────────────────────────┘  └────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  KOYEB (Free Tier — always-on nano instance)                         │   │
│  │                                                                      │   │
│  │  BullMQ Worker Process (npm run worker)                              │   │
│  │  • ingest-document worker — PDF parse → chunk → embed → Supabase    │   │
│  │  • summarize-session worker — rolling conversation summaries         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  SHARED SERVICES (Free Tiers)                                        │   │
│  │                                                                      │   │
│  │  Supabase (existing)          Upstash Redis (new — free tier)        │   │
│  │  rdasrmihlrgpthbtoele         • BullMQ queues                        │   │
│  │  • ai_chat_sessions           • Session pub/sub                      │   │
│  │  • ai_chat_messages           • Tashus API response cache            │   │
│  │  • ai_documents               • Rate limiting                        │   │
│  │  • ai_knowledge_base          • 10,000 req/day free                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Free Tier Limits & Suitability

| Service | Free Allowance | Our Usage | Fits? |
|---|---|---|---|
| **Vercel Hobby** | 100GB bandwidth, 100 serverless func exec/day | AI chat API calls | ✅ Yes |
| **Vercel Hobby** | 10s max function timeout (Fluid compute: 800s) | SSE streams need 60s+ | ⚠️ See §3.1 |
| **Upstash Redis** | 10,000 commands/day, 256MB | Pub/sub, queues, cache | ✅ Yes |
| **Koyeb Nano** | 1 free nano instance (0.1 vCPU, 256MB RAM) | Worker process | ✅ Yes |
| **Supabase Free** | 500MB DB, 1GB storage, 50MB file upload | Existing project | ✅ Already in use |
| **Groq Free** | 14,400 req/day (6 keys = ~86,400) | LLM inference | ✅ Yes |

### ⚠️ Vercel SSE Timeout Constraint

Vercel Hobby limits serverless functions to **10 seconds**. The chat stream (`/api/ai/chat/stream`) and SSE endpoints can run longer. **Solutions (pick one):**

- **Option A (Recommended for free):** Enable **Vercel Fluid Compute** in project settings — extends timeout to 800 seconds on Hobby. No code change needed.
- **Option B:** Move SSE-heavy routes to a separate Koyeb deployment (adds complexity).
- **Option C:** Use streaming responses with a 9s keepalive heartbeat and client-side reconnect (already partially implemented).

> **Recommendation: Enable Fluid Compute on Vercel. It's free on Hobby tier.**

---

## 3. Step-by-Step Deployment

### Step 1 — Set Up Upstash Redis

Redis is required before deploying anything else (BullMQ and pub/sub depend on it).

1. Go to [console.upstash.com](https://console.upstash.com) → **Create Database**
2. Name: `tashus-ai-redis`
3. Region: Pick closest to your Supabase region (Supabase is likely `ap-southeast-1` if it's Australian)
4. **Select "Redis"** (not Kafka)
5. After creation, go to **Details** tab → copy the **Redis URL**
   - Format: `redis://default:<password>@<host>:<port>`
   - For TLS: `rediss://default:<password>@<host>:<port>`
6. Also copy the **REST URL** and **REST Token** (needed for Vercel env vars that use HTTP-based Redis)

> Keep the Redis URL safe — you'll need it in all three deployments (ai-backend, ai-admin, Koyeb worker).

---

### Step 2 — Deploy `ai-backend` to Vercel

#### 2.1 Prepare the repository

Vercel deploys from a Git repo. Your monorepo has both `ai-backend` and `ai-admin` in `TashusChatBot/`. You'll create **two separate Vercel projects** pointing to the same repo with different root directories.

Make sure these are in your `.gitignore`:
```
.env.local
.env.*.local
node_modules/
.next/
dist/
```

#### 2.2 Create the Vercel project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your Git repository (GitHub/GitLab/Bitbucket)
3. **Root Directory:** `ai-backend`  
   *(Click "Edit" next to root directory and type `ai-backend`)*
4. **Framework Preset:** Next.js (auto-detected)
5. **Build Command:** `npm run build`
6. **Output Directory:** `.next` (default)
7. Click **Environment Variables** and add all variables from the table in §3.2.1 below
8. Click **Deploy**

#### 2.3 `ai-backend` Environment Variables

Add these in the Vercel dashboard under **Settings → Environment Variables**. Set them for **Production**, **Preview**, and **Development** environments.

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://rdasrmihlrgpthbtoele.supabase.co` | Your existing Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` (full key) | From Supabase Dashboard → Settings → API |
| `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | From Upstash (use TLS `rediss://`) |
| `GROK_API_KEYS` | `gsk_xxx,gsk_yyy,gsk_zzz,...` | All 6 Groq keys comma-separated |
| `GROK_API_BASE_URL` | `https://api.groq.com/openai` | Groq base URL |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Optional fallback LLM |
| `EMBEDDING_PROVIDER` | `openai` | |
| `EMBEDDING_PROVIDER_API_KEY` | `sk-...` | OpenAI key for embeddings |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | |
| `EMBEDDING_DIMENSION` | `1536` | |
| `TASHUS_API_BASE_URL` | `https://dev-testing-api.tashus.com/api` | Or production API URL |
| `JWT_SIGNING_SECRET_ADMIN` | Generate a 32+ char secret | **Must match ai-admin's value** |
| `NODE_ENV` | `production` | |
| `NEXT_PUBLIC_APP_URL` | `https://tashus-ai.vercel.app` | Your Vercel URL after first deploy |

#### 2.4 Enable Fluid Compute

After deploying:
1. Vercel Dashboard → your `ai-backend` project → **Settings → Functions**
2. Enable **Fluid compute** → Save
3. Set **Max Duration** to `300` seconds (or max allowed on Hobby)

#### 2.5 Verify deployment

```bash
# Test the health endpoint
curl https://tashus-ai.vercel.app/api/ai/session -X POST \
  -H "Content-Type: application/json" \
  -d '{"visitorId":"test-visitor-1"}'

# Should return: {"sessionId":"<uuid>"}
```

---

### Step 3 — Deploy `ai-admin` to Vercel

#### 3.1 Create second Vercel project

1. Vercel → **Add New Project** → same repository
2. **Root Directory:** `ai-admin`
3. **Framework Preset:** Next.js
4. **Build Command:** `npm run build`
5. Add environment variables (§3.2 below)
6. Deploy

#### 3.2 `ai-admin` Environment Variables

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_AI_BACKEND_URL` | `https://tashus-ai.vercel.app` | Your `ai-backend` Vercel URL |
| `SUPABASE_URL` | `https://rdasrmihlrgpthbtoele.supabase.co` | Same as ai-backend |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` (full key) | Same as ai-backend |
| `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | Same Upstash URL |
| `JWT_SIGNING_SECRET_ADMIN` | Same secret as ai-backend | **Must be identical** |
| `EMBEDDING_PROVIDER` | `openai` | |
| `EMBEDDING_PROVIDER_API_KEY` | `sk-...` | Same OpenAI key |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | |
| `EMBEDDING_DIMENSION` | `1536` | |

#### 3.3 Fix the default port

The `package.json` has `"start": "next start --port 4001"`. Vercel ignores custom ports (it manages its own). This is fine — Vercel overrides it. No change needed.

#### 3.4 Verify deployment

```bash
# Admin panel should be reachable
curl -I https://tashus-admin.vercel.app/login
# Should return 200
```

---

### Step 4 — Deploy BullMQ Worker to Koyeb

The worker process (`npm run worker`) is a long-running Node.js process — not a web server. It cannot run on Vercel. Koyeb's free nano instance is ideal for this.

#### 4.1 Create a Dockerfile for the worker

Create this file at `ai-backend/Dockerfile.worker`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production=false

# Copy source
COPY . .

# Install tsx globally for running TypeScript directly
RUN npm install -g tsx

# Expose no port — this is a worker, not a web server
EXPOSE 0

# Health check — worker is healthy if the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD pgrep -f "run-workers" || exit 1

CMD ["npm", "run", "worker"]
```

Add this to `ai-backend/package.json` if not already present — the `worker` script:
```json
"worker": "tsx src/workers/run-workers.ts"
```
*(Already present — no change needed)*

#### 4.2 Create a Koyeb account

1. Go to [koyeb.com](https://www.koyeb.com) → Sign up (free, no credit card required)
2. Free tier includes: **1 nano service** (0.1 vCPU, 256MB RAM, always-on)

#### 4.3 Deploy the worker on Koyeb

**Option A — Deploy from Docker (Recommended):**

1. Push your repo to GitHub (if not already)
2. Koyeb Dashboard → **Create Service** → **GitHub**
3. Select your repository
4. **Build settings:**
   - Dockerfile path: `ai-backend/Dockerfile.worker`
   - Build context: `ai-backend`
5. **Service type:** Worker (not Web)
6. **Instance type:** Nano (free)
7. **Environment Variables** — add all the same vars as ai-backend (§3.2.3) plus:
   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | Same as ai-backend |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same as ai-backend |
   | `REDIS_URL` | Same Upstash Redis URL |
   | `GROK_API_KEYS` | Same Groq keys |
   | `ANTHROPIC_API_KEY` | Same (optional) |
   | `EMBEDDING_PROVIDER` | `openai` |
   | `EMBEDDING_PROVIDER_API_KEY` | Same OpenAI key |
   | `EMBEDDING_MODEL` | `text-embedding-3-large` |
   | `EMBEDDING_DIMENSION` | `1536` |
   | `TASHUS_API_BASE_URL` | Same Tashus API URL |
   | `JWT_SIGNING_SECRET_ADMIN` | Same secret |
   | `NODE_ENV` | `production` |
8. **Scaling:** 1 instance (Nano)
9. **Health check:** None (it's a worker, not a web server)
10. Click **Deploy**

**Option B — Deploy from Docker Hub (Alternative):**

Build and push manually:
```bash
cd ai-backend
docker build -f Dockerfile.worker -t your-dockerhub/tashus-worker:latest .
docker push your-dockerhub/tashus-worker:latest
```
Then on Koyeb, create service from Docker image instead.

#### 4.4 Verify worker is running

In Koyeb dashboard → your service → **Logs**. You should see:
```
[Workers] Starting background workers...
[Workers] Ingestion and Summarization workers are active and listening.
[Redis] Connected
```

---

### Step 5 — Update `next.config.js` for Vercel Compatibility

Vercel requires `serverExternalPackages` instead of the deprecated `serverComponentsExternalPackages` in Next.js 14.2.4. Also, `argon2` needs special handling:

The current `ai-backend/next.config.js` already has the correct config. No change needed.

For `ai-admin`, check that `argon2` builds correctly on Vercel — it requires native bindings. Add this to `ai-admin/next.config.js`:

```js
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'bullmq', 'ioredis'],
  },
  // ... existing config
};
```

---

### Step 6 — Production Auth — Remove Dev Bypass

The `resolveAdmin` function in `ai-admin/src/lib/auth.ts` bypasses JWT auth in non-production mode. On Vercel `NODE_ENV=production`, this bypass is already disabled — production will always require a valid JWT cookie.

**Before deploying, create a production admin user in Supabase:**

Run this SQL in Supabase SQL editor:
```sql
-- Generate a bcrypt hash of your password first using: 
-- node -e "const argon2 = require('argon2'); argon2.hash('YourPassword123!').then(console.log)"
INSERT INTO ai_admin_users (email, password_hash, display_name, role, is_active)
VALUES (
  'admin@tashus.com',
  '$argon2id$v=19$m=65536,t=3,p=4$...your-hash-here...',
  'Admin',
  'super_admin',
  true
);
```

Or use the admin registration endpoint if available:
```bash
curl -X POST https://tashus-admin.vercel.app/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tashus.com","password":"YourPassword123!"}'
```

---

### Step 7 — Widget Integration Update

After deploying `ai-backend`, update the widget's backend URL in the Tashus Frontend's `.env`:

```env
# .env (Tashus_Frontend_V1)
NEXT_PUBLIC_AI_BACKEND_URL=https://tashus-ai.vercel.app
```

The widget is embedded via a `<script>` tag pointing to `widget.js`. Since the widget is served from `ai-backend/public/widget.js`, it will be served automatically by Vercel from the deployed `ai-backend`.

Update the embed script on the Tashus frontend from:
```html
<script src="http://localhost:3001/widget.js"></script>
```
to:
```html
<script 
  src="https://tashus-ai.vercel.app/widget.js"
  data-backend-url="https://tashus-ai.vercel.app">
</script>
```

---

## 4. Vercel Configuration Files (Add to repo before deploying)

### `ai-backend/vercel.json`

```json
{
  "functions": {
    "src/app/api/ai/chat/stream/route.ts": {
      "maxDuration": 300
    },
    "src/app/api/ai/session/*/stream/route.ts": {
      "maxDuration": 300
    },
    "src/app/api/ai/ingest/route.ts": {
      "maxDuration": 120
    },
    "src/app/api/admin/notifications/stream/route.ts": {
      "maxDuration": 300
    }
  }
}
```

### `ai-admin/vercel.json`

```json
{
  "functions": {
    "src/app/api/admin/notifications/stream/route.ts": {
      "maxDuration": 300
    }
  }
}
```

---

## 5. Monorepo Structure for Vercel

Your repo structure is:
```
TashusChatBot/
├── ai-backend/      ← Vercel Project 1 (root dir: ai-backend)
├── ai-admin/        ← Vercel Project 2 (root dir: ai-admin)
├── ai-widget/       ← Built output copied to ai-backend/public/widget.js
└── ...
```

Vercel handles monorepos natively by setting the **Root Directory** per project. No `vercel.json` monorepo config is needed at the repo root.

---

## 6. CORS Configuration for Production

The `ai-backend` needs to allow requests from:
- `https://tashus-admin.vercel.app` (admin panel)
- `https://tashus.com` (or wherever the Tashus frontend is hosted)
- `https://*.tashus.com` (subdomains)

Check `ai-backend/src/middleware.ts` and ensure the `CORS_ALLOWED_ORIGINS` env var (if present) includes the production domains. If not, add it:

```env
# ai-backend production env vars
CORS_ALLOWED_ORIGINS=https://tashus-admin.vercel.app,https://tashus.com,https://www.tashus.com
```

---

## 7. Deployment Checklist

### Before deploying
- [ ] Upstash Redis created and URL copied
- [ ] All env vars collected and ready
- [ ] `ai-backend/Dockerfile.worker` created (§4.1)
- [ ] `ai-backend/vercel.json` created (§4 above)
- [ ] `ai-admin/vercel.json` created (§4 above)
- [ ] Production admin user SQL ready (§6)
- [ ] `JWT_SIGNING_SECRET_ADMIN` is the same 32+ char value in both projects
- [ ] Repo pushed to GitHub

### Deploy ai-backend
- [ ] Vercel project created, root dir = `ai-backend`
- [ ] All env vars set in Vercel dashboard
- [ ] First deploy succeeds
- [ ] Fluid Compute enabled
- [ ] Session creation endpoint tested (`POST /api/ai/session`)
- [ ] Chat stream tested (`POST /api/ai/chat/stream`)

### Deploy ai-admin
- [ ] Vercel project created, root dir = `ai-admin`
- [ ] All env vars set (including `NEXT_PUBLIC_AI_BACKEND_URL` pointing to deployed backend)
- [ ] `JWT_SIGNING_SECRET_ADMIN` matches ai-backend exactly
- [ ] First deploy succeeds
- [ ] Login page accessible
- [ ] Admin login works
- [ ] Sessions page loads

### Deploy worker to Koyeb
- [ ] Koyeb account created
- [ ] `Dockerfile.worker` pushed to GitHub
- [ ] Koyeb service created from GitHub
- [ ] All env vars set (same as ai-backend)
- [ ] Worker logs show `active and listening`
- [ ] Redis connection confirmed in logs
- [ ] Test document ingestion via admin panel

### Post-deployment
- [ ] Widget embed script updated on Tashus frontend
- [ ] End-to-end chat test (send message → AI responds)
- [ ] Handoff flow test (request human → admin receives notification)
- [ ] Document upload + ingestion test
- [ ] Knowledge base query test

---

## 8. Estimated Costs

| Service | Free Tier Limit | Estimated Monthly Usage | Cost |
|---|---|---|---|
| Vercel (ai-backend) | 100GB bandwidth, 6,000 GB-hrs compute | < 1GB bandwidth, < 100 GB-hrs | **$0** |
| Vercel (ai-admin) | Same as above | Minimal | **$0** |
| Upstash Redis | 10,000 commands/day (300k/month) | ~5,000-20,000/month | **$0** |
| Koyeb Worker | 1 nano instance always-on | 1 instance | **$0** |
| Supabase | Already in use | Already in use | **$0** |
| Groq API | ~14,400 req/day per key × 6 keys | Variable | **$0** |
| **Total** | | | **$0/month** |

---

## 9. Scaling Path (When Free Tier is Outgrown)

When the project grows beyond free limits, the natural upgrade path is:

| Current | Upgrade To | Cost |
|---|---|---|
| Vercel Hobby | Vercel Pro ($20/month) | Better timeouts, more bandwidth |
| Upstash Free | Upstash Pay-as-you-go | ~$0.20 per 100k commands |
| Koyeb Nano | Koyeb Starter ($5.50/month) | More RAM/CPU for heavy ingestion |
| Supabase Free | Supabase Pro ($25/month) | More DB size, daily backups |

---

## 10. Troubleshooting Common Deployment Issues

### `Function timeout exceeded` on Vercel
- Enable Fluid Compute in Vercel → Settings → Functions
- Ensure `vercel.json` has `maxDuration: 300` for stream routes

### Redis connection refused on Koyeb/Vercel
- Use `rediss://` (with double `s`) for TLS — Upstash requires TLS
- Check `REDIS_URL` env var has no trailing whitespace
- Upstash only allows TLS connections in production

### `argon2` build failure on Vercel
- Add to `ai-admin/next.config.js`:
  ```js
  experimental: { serverComponentsExternalPackages: ['argon2'] }
  ```
- Or swap to `bcryptjs` (pure JS, no native bindings needed)

### Worker keeps restarting on Koyeb
- 256MB RAM may be tight if processing large PDFs
- Reduce `concurrency` in `createWorker()` from `2` to `1` in `queue.ts`
- For the `ingest-document` worker, the PDF parse step is memory-intensive

### SSE streams not working from admin panel
- The admin panel calls `ai-backend` for SSE — ensure `NEXT_PUBLIC_AI_BACKEND_URL` is correct
- Check browser network tab for CORS errors — add admin Vercel domain to allowed origins

### Admin login redirects loop
- Check `JWT_SIGNING_SECRET_ADMIN` is identical in both ai-backend and ai-admin Vercel env vars
- Verify `NODE_ENV=production` is set (enables real JWT auth, disables dev bypass)

---

## 11. Quick Reference — URLs After Deployment

| Service | URL |
|---|---|
| AI Backend API | `https://tashus-ai.vercel.app` |
| Widget JS | `https://tashus-ai.vercel.app/widget.js` |
| AI Admin Panel | `https://tashus-admin.vercel.app` |
| Worker Logs | Koyeb Dashboard → Services → your-worker → Logs |
| Supabase Studio | `https://supabase.com/dashboard/project/rdasrmihlrgpthbtoele` |
| Upstash Console | `https://console.upstash.com` |

---

*Last updated: 2026-07-27*  
*Project: Tashus AI Chatbot v2.0*
