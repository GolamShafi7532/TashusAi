/**
 * LLM Fallback Chain with Circuit Breaker (v3.1.0 — Phase D.2)
 *
 * Tries providers in order, skipping any that have tripped their circuit
 * breaker (failed recently). Each provider gets a configurable timeout.
 *
 * Default chain when all keys are real:
 *   1. Groq (primary, fastest, cheapest)
 *   2. OpenRouter (same Llama 3.1 70B model, slightly higher cost)
 *   3. Anthropic (highest quality, highest cost — last resort)
 *
 * Circuit breaker:
 *   - A provider that throws a retryable error (429, 5xx, timeout) opens
 *     its circuit for CIRCUIT_COOLDOWN_MS (60 seconds by default).
 *   - While open, that provider is skipped so requests don't pile up.
 *   - After the cooldown the circuit closes automatically and the provider
 *     is retried on the next request.
 *
 * Usage: import fallbackChain from here and call streamWithFallback() in
 * llm.ts instead of calling tryGrokStream() directly.
 */

import type { LLMProvider, LLMCallParams, StreamChunk } from './types';
import { OpenRouterProvider } from './openrouter';
import { env } from '@/lib/env';

// ── Circuit breaker state (in-process, not Redis — per pod) ───────────────────

interface CircuitState {
  open: boolean;
  openedAt: number;   // Unix ms
  lastError: string;
}

const CIRCUIT_COOLDOWN_MS = 60_000;   // 60 s before retry
const REQUEST_TIMEOUT_MS  = 8_000;    // 8 s hard timeout per provider attempt

const circuitState = new Map<string, CircuitState>();

function isCircuitOpen(name: string): boolean {
  const state = circuitState.get(name);
  if (!state || !state.open) return false;
  if (Date.now() - state.openedAt >= CIRCUIT_COOLDOWN_MS) {
    // Auto-reset after cooldown
    state.open = false;
    console.log(`[FallbackChain] Circuit for "${name}" auto-reset after cooldown`);
    return false;
  }
  return true;
}

function openCircuit(name: string, reason: string) {
  circuitState.set(name, { open: true, openedAt: Date.now(), lastError: reason });
  console.warn(`[FallbackChain] ⚡ Circuit OPEN for "${name}": ${reason}`);
}

function isRetryable(err: any): boolean {
  const retryableStatuses = [429, 500, 502, 503, 504];
  return (
    retryableStatuses.includes(err?.status) ||
    String(err?.message).toLowerCase().includes('rate limit') ||
    String(err?.message).toLowerCase().includes('timeout') ||
    String(err?.message).toLowerCase().includes('econnreset')
  );
}

// ── Timeout wrapper for async generators ─────────────────────────────────────

async function* withTimeout<T>(
  gen: AsyncGenerator<T>,
  ms: number,
  label: string
): AsyncGenerator<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { status: 504 }));
    }, ms);
  });

  try {
    const iterator = gen[Symbol.asyncIterator]();
    while (true) {
      if (timedOut) break;
      const result = await Promise.race([
        iterator.next(),
        timeoutPromise,
      ]) as IteratorResult<T>;

      if (result.done) break;
      yield result.value;
    }
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

// ── Fallback chain ─────────────────────────────────────────────────────────────

/**
 * Stream from the first available provider, cascading through fallbacks.
 * Providers are registered lazily — if a key isn't configured the provider
 * is simply not added to the chain.
 *
 * The `groqStream` and `anthropicStream` generators are passed in from
 * llm.ts to avoid duplicating the existing Groq/Anthropic implementation.
 */
export async function* streamWithFallback(
  params: LLMCallParams,
  groqStream: ((p: LLMCallParams) => AsyncGenerator<StreamChunk>) | null,
  anthropicStream: ((p: LLMCallParams) => AsyncGenerator<StreamChunk>) | null
): AsyncGenerator<StreamChunk> {

  // Build the ordered provider list for this call
  const providers: Array<{ name: string; stream: (p: LLMCallParams) => AsyncGenerator<StreamChunk> }> = [];

  if (groqStream)     providers.push({ name: 'groq',      stream: groqStream });

  if (env.OPENROUTER_API_KEY) {
    const or = new OpenRouterProvider(env.OPENROUTER_API_KEY);
    providers.push({ name: 'openrouter', stream: (p) => or.stream(p) });
  }

  if (anthropicStream) providers.push({ name: 'anthropic', stream: anthropicStream });

  if (providers.length === 0) {
    throw new Error('No LLM providers configured. Set GROK_API_KEYS or ANTHROPIC_API_KEY.');
  }

  const errors: string[] = [];

  for (const provider of providers) {
    if (isCircuitOpen(provider.name)) {
      console.log(`[FallbackChain] ⏭  Skipping "${provider.name}" — circuit open`);
      errors.push(`${provider.name}: circuit open`);
      continue;
    }

    try {
      console.log(`[FallbackChain] 🔄  Trying provider: ${provider.name}`);
      let yieldedAny = false;

      for await (const chunk of withTimeout(provider.stream(params), REQUEST_TIMEOUT_MS, provider.name)) {
        yieldedAny = true;
        yield chunk;
      }

      if (yieldedAny) {
        console.log(`[FallbackChain] ✅  ${provider.name} succeeded`);
        return;
      }

      // Provider returned an empty stream — treat as soft failure
      throw new Error(`${provider.name} returned empty stream`);

    } catch (err: any) {
      console.error(`[FallbackChain] ❌  ${provider.name} failed: ${err.message}`);
      errors.push(`${provider.name}: ${err.message}`);

      if (isRetryable(err)) {
        openCircuit(provider.name, err.message);
        continue;   // try next provider
      }

      // Non-retryable (e.g. bad auth, invalid request) — stop the chain
      throw err;
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.map((e) => `  • ${e}`).join('\n')}`);
}

/**
 * Expose current circuit state for the metrics/health endpoint.
 */
export function getCircuitState(): Record<string, CircuitState> {
  return Object.fromEntries(circuitState.entries());
}
