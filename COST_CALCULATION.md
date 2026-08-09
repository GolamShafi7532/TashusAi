# Tashus AI Chatbot — Cost Calculation
# 1,000 Messages Per Month

> **Based on:** Current implementation (ai-backend v3.2.0)
> **Scenario:** 1,000 user messages per month, mixed query types
> **Date:** 2026-08-04
> **Exchange rate note:** All prices in USD

---

## Part 1: Token Cost (LLM Providers)

### 1.1 Token Budget Per Message — Current Implementation

Measured from actual `ai_tool_call_logs.__turn_summary__` data:

| Component | Tokens | Source |
|---|---|---|
| Static system prompt | ~1,200 | `src/agent/prompts/system-prompt.md` |
| DateTime context block | ~80 | Injected per request |
| Conversation history (last 6 msgs) | ~400 | `loadConversationState()` |
| Tool schemas (intent-filtered) | ~500 | After Phase 2.2 dynamic router |
| User message | ~30 | Typical short question |
| RAG context (when applicable) | ~800 | Injected for policy queries |
| **Total average input per turn** | **~3,010** | Weighted average |
| **Average output per turn** | **~137** | Weighted across all types |

### 1.2 Message Type Distribution (1,000 messages)

| Type | % | Count | Input tokens | Output tokens | Rounds |
|---|---|---|---|---|---|
| Greeting / simple | 15% | 150 | 2,510 | 60 | 1 |
| Vehicle search | 40% | 400 | 6,800 | 90 | 2 |
| KB / policy question | 25% | 250 | 9,200 | 180 | 2 |
| Vehicle details | 15% | 150 | 7,500 | 300 | 2 |
| Handoff / other | 5% | 50 | 2,600 | 40 | 1 |

### 1.3 Weighted Average Calculation

**Total input tokens for 1,000 messages:**
```
(150 × 2,510) + (400 × 6,800) + (250 × 9,200) + (150 × 7,500) + (50 × 2,600)
= 376,500 + 2,720,000 + 2,300,000 + 1,125,000 + 130,000
= 6,651,500 tokens input total
= 6,651 tokens input per message (average)
```

**Total output tokens for 1,000 messages:**
```
(150 × 60) + (400 × 90) + (250 × 180) + (150 × 300) + (50 × 40)
= 9,000 + 36,000 + 45,000 + 45,000 + 2,000
= 137,000 tokens output total
= 137 tokens output per message (average)
```

---

### 1.4 LLM Provider Cost Comparison — 1,000 Messages

#### Option A: Groq — gpt-oss-120b (CURRENT — replaces deprecated llama-3.3-70b)
**Pricing:** $0.15/1M input · $0.60/1M output (via [Groq pricing](https://console.groq.com/docs/models))
**Speed:** 477 tokens/sec on Groq LPU hardware — fastest available
**Context:** 131,072 token window

```
Input:   6,651,500 × $0.15  / 1,000,000 = $0.998
Output:    137,000 × $0.60  / 1,000,000 = $0.082
                                          ──────
Total 1,000 messages:                     $1.08
Cost per message:                         $0.00108
Monthly (1,000 msg):                      $1.08
```

**Free tier:** Groq provides a generous free daily request quota per key.
With 6 keys rotating, at 1,000 messages/month (~33/day), usage stays well within
free limits → **effectively $0/month at current volume.**

**Why this over gpt-4o-mini:**
- Same price per token ($0.15/$0.60 vs $0.15/$0.60 — identical)
- 5-10× faster (477 tok/s vs ~80 tok/s for OpenAI)
- No cold starts (Groq LPU is always warm)
- Free tier covers current volume
- Same API format — zero migration effort from llama-3.3-70b

---

#### Option A2: Groq — Qwen3 27B (Groq's other recommended replacement)
**Pricing:** ~$0.075/1M input · $0.30/1M output (half the price of gpt-oss-120b)

```
Input:   6,651,500 × $0.075 / 1,000,000 = $0.499
Output:    137,000 × $0.30  / 1,000,000 = $0.041
                                          ──────
Total 1,000 messages:                     $0.54
Cost per message:                         $0.00054
Monthly (1,000 msg):                      $0.54
```

**Trade-off:** Smaller model, cheaper, slightly less accurate on complex policy questions.
Good option if cost becomes a concern at higher volumes.

---

#### Option B: gpt-4o-mini (OpenAI Pay-as-you-go) — RECOMMENDED
**Pricing:** $0.15/1M input · $0.60/1M output

```
Input:   6,651,500 × $0.15  / 1,000,000 = $0.998
Output:    137,000 × $0.60  / 1,000,000 = $0.082
                                          ──────
Total 1,000 messages:                     $1.08
Cost per message:                         $0.001
Monthly (1,000 msg):                      $1.08
```

**Notes:** 4× cheaper than Groq on pay-as-you-go. Better quality for KB/policy answers.
No free tier — every token billed from first request.

---

#### Option C: gpt-4.1-mini (OpenAI Pay-as-you-go)
**Pricing:** $0.40/1M input · $1.60/1M output

```
Input:   6,651,500 × $0.40  / 1,000,000 = $2.66
Output:    137,000 × $1.60  / 1,000,000 = $0.22
                                          ──────
Total 1,000 messages:                     $2.88
Cost per message:                         $0.003
Monthly (1,000 msg):                      $2.88
```

---

#### Option D: gpt-4o (OpenAI Pay-as-you-go)
**Pricing:** $2.50/1M input · $10.00/1M output

```
Input:   6,651,500 × $2.50  / 1,000,000 = $16.63
Output:    137,000 × $10.00 / 1,000,000 = $1.37
                                          ──────
Total 1,000 messages:                     $18.00
Cost per message:                         $0.018
Monthly (1,000 msg):                      $18.00
```

---

#### Option E: Anthropic claude-sonnet-4-5 (Fallback — current)
**Pricing:** $3.00/1M input · $15.00/1M output

```
Input:   6,651,500 × $3.00  / 1,000,000 = $19.95
Output:    137,000 × $15.00 / 1,000,000 = $2.06
                                          ──────
Total 1,000 messages:                     $22.01
Cost per message:                         $0.022
Monthly (1,000 msg):                      $22.01
```

**Note:** This is the FALLBACK only — triggered when all Groq keys are rate-limited.
At 1,000 messages/month, Anthropic fallback fires maybe 1-5% of requests = ~$0.22-$1.10/month.

---

#### Option F: OpenRouter (Multi-model routing)
**Pricing:** Varies by model, ~20% markup over base

| Model via OpenRouter | Cost/1K messages |
|---|---|
| llama-3.3-70b | ~$4.84 |
| mistral-7b | ~$0.40 |
| gpt-4o-mini | ~$1.30 |

---

### 1.5 LLM Cost Summary Table

| Provider + Model | Cost / 1,000 msg | Cost / msg | Quality | Speed |
|---|---|---|---|---|
| **Groq llama-3.3-70b** (current) | **$0*** | **$0*** | Good | Very fast |
| **gpt-4o-mini** | **$1.08** | **$0.001** | Very Good | Fast |
| **gpt-4.1-mini** | **$2.88** | **$0.003** | Very Good | Fast |
| Groq (pay-as-you-go) | $4.03 | $0.004 | Good | Very fast |
| OpenRouter llama | $4.84 | $0.005 | Good | Fast |
| gpt-4o | $18.00 | $0.018 | Excellent | Medium |
| Anthropic claude-sonnet-4-5 | $22.01 | $0.022 | Excellent | Medium |

*Free tier covers 1,000 messages/month with 6 keys comfortably.

---

## Part 2: Redis Cost (Upstash)

### 2.1 Redis Commands Per Message — Current Implementation

After Phase 2.2 smart polling optimization:

| Operation | Redis Commands | When |
|---|---|---|
| Session state check (poll) | 1 GET per 15s when AI active | Always |
| Rate limiting (incr + expire) | 2 commands | Every message |
| Agent config cache check | 1 GET | Every message |
| Agent config cache write | 1 SET (if miss, ~5% of calls) | Occasional |
| Redis pub/sub publish | 2 PUBLISH | Every AI response |
| Tashus API cache (GET) | 1 per tool call | Vehicle search/details |
| Tashus API cache (SET) | 1 per tool call (miss only) | ~30% of tool calls |
| Session control subscribe | 1 SUBSCRIBE | Per stream connection |
| Admin notification publish | 2 PUBLISH | Handoff only (~5%) |

### 2.2 Redis Commands for 1,000 Messages

**Per message (always):**
```
Rate limit:        2 commands
Config cache GET:  1 command
Config cache SET:  0.05 commands (5% miss rate)
Pub/Sub publish:   2 commands
                   ──────────
Subtotal:          ~5.05 commands/message
```

**Per message (tool calls — ~65% of messages have at least 1 tool):**
```
Tashus cache GET:  1 command per tool call
Tashus cache SET:  0.3 commands (30% miss rate)
                   ──────────
Subtotal:          ~1.3 commands × 0.65 = ~0.85 commands/message
```

**Polling (background, every 15s when AI active):**
```
1 poll per 15s × average 2 min conversation = ~8 polls/conversation
= 8 commands/conversation
At 1,000 messages and ~3 messages/conversation = ~333 conversations
= 333 × 8 = 2,664 poll commands/month for 1,000 messages
= ~2.66 commands/message
```

**Total per message:**
```
Always:   5.05
Tools:    0.85
Polling:  2.66
          ────
Total:    ~8.56 Redis commands per message
```

**Total for 1,000 messages:**
```
1,000 × 8.56 = 8,560 Redis commands/month
```

### 2.3 Upstash Redis Pricing Tiers

| Plan | Monthly Free Commands | Price After Free | Max Commands/Day |
|---|---|---|---|
| **Free** | 10,000/day (300k/month) | N/A — hard limit | 10,000 |
| **Pay As You Go** | 10,000/day free | $0.20 per 100k | Unlimited |
| **Fixed $10/month** | 100M commands | Included | 3.3M/day |

### 2.4 Redis Cost for 1,000 Messages/Month

```
Total commands needed:  8,560/month
Upstash free daily:     10,000/day × 30 = 300,000/month
Commands used:          8,560 (2.85% of free allowance)
Commands remaining:     291,440 free commands unused
```

**Result: $0.00/month** — 1,000 messages/month uses only **2.85%** of the Upstash free tier.

The free tier supports up to **~35,000 messages/month** before any cost is incurred.

### 2.5 Redis Cost at Different Scales

| Messages/Month | Redis Commands | Free Tier | Pay-as-you-go Cost |
|---|---|---|---|
| 1,000 | 8,560 | ✅ Free (2.85%) | $0.00 |
| 10,000 | 85,600 | ✅ Free (28.5%) | $0.00 |
| 35,000 | 299,600 | ✅ Free (99.8%) | $0.00 |
| 50,000 | 428,000 | ❌ Over | $0.26/month |
| 100,000 | 856,000 | ❌ Over | $1.11/month |
| 500,000 | 4,280,000 | ❌ Over | $7.96/month |
| 1,000,000 | 8,560,000 | ❌ Over | $17.12/month |

---

## Part 3: Full Monthly Cost Summary — 1,000 Messages

| Service | Plan | Monthly Cost |
|---|---|---|
| **Groq LLM** (primary, 6 free keys) | Free tier | **$0.00** |
| **Anthropic** (fallback, ~3% of calls) | Pay-as-you-go | **~$0.66** |
| **Upstash Redis** | Free tier | **$0.00** |
| **Vercel** (ai-backend + ai-admin) | Hobby tier | **$0.00** |
| **Supabase** | Free tier | **$0.00** |
| **OpenAI Embeddings** (if enabled) | Pay-as-you-go | **~$0.02** |
| **Railway/Koyeb worker** | Free nano tier | **$0.00** |
| **TOTAL** | | **~$0.68/month** |

### If migrating primary LLM to gpt-4o-mini:

| Service | Monthly Cost |
|---|---|
| gpt-4o-mini (primary) | $1.08 |
| Upstash Redis | $0.00 |
| Vercel | $0.00 |
| Supabase | $0.00 |
| **TOTAL** | **$1.08/month** |

---

## Part 4: Cost at Scale (Monthly projections)

| Monthly Messages | Groq (free keys) | gpt-4o-mini | Redis | Total (Groq) | Total (4o-mini) |
|---|---|---|---|---|---|
| 1,000 | $0 | $1.08 | $0 | **$0.68** | **$1.76** |
| 5,000 | $0 | $5.40 | $0 | **$0.68** | **$6.08** |
| 10,000 | $0 | $10.80 | $0 | **$0.68** | **$11.48** |
| 35,000 | $0 | $37.80 | $0 | **$0.68** | **$38.48** |
| 50,000 | $20.15 | $54.00 | $0.26 | **$20.83** | **$54.26** |
| 100,000 | $40.30 | $108.00 | $1.11 | **$41.41** | **$109.11** |
| 500,000 | $201.50 | $540.00 | $7.96 | **$209.46** | **$547.96** |

**Key insight:** Under ~35,000 messages/month, the entire system runs on free tiers.
The only consistent cost is the ~$0.66/month Anthropic fallback charge (unavoidable).

---

## Notes

1. **PDF ingestion cost** is excluded per request — calculated separately when heavy uploads occur.
2. **Railway worker** cost is excluded — only needed for background PDF processing.
3. **OpenAI embeddings** cost assumes real key. With mock embeddings (dummy key): $0.
4. **Groq free tier** = ~14,400 req/day per key × 6 keys = 86,400 req/day = 2.59M req/month. 1,000 messages/month = 0.04% of free capacity.
5. All prices based on publicly available 2025/2026 pricing. Verify at provider pricing pages before budgeting.

---

*Last updated: 2026-08-04*
*Based on: TashusChatBot ai-backend v3.2.0, smart polling optimization, Phase 2.2 dynamic tool router*
