/**
 * Post-generation hallucination detector (v3.1.0 — Phase C.4)
 *
 * Scans the LLM's final response for factual inconsistencies against the
 * tool results and RAG context that were provided in the same turn.
 *
 * Works with the v3.1.0 masked payload format (FilteredSearchResult /
 * MaskedVehicleDetails) as well as the legacy raw array format so it
 * remains compatible during the canary rollout period.
 *
 * Checks performed:
 *  1. Empty search result hallucination — LLM claims vehicles are available
 *     when search returned 0 matches.
 *  2. Price hallucination — LLM quotes a specific price not found in any
 *     tool result or the RAG context.
 *  3. Policy hallucination — LLM makes policy claims without RAG backing.
 *
 * Usage: call detectHallucinations() after the final LLM response is
 * assembled. Log warnings; optionally block response in high-stakes env.
 */

import type { FilteredSearchResult, MaskedVehicle } from '@/integrations/tashus-adapter/filter-engine';

// ── Public types ───────────────────────────────────────────────────────────────

export interface ToolResult {
  tool: string;
  data: unknown;
}

export interface HallucinationCheckResult {
  safe: boolean;
  warnings: string[];
}

// ── Main checker ───────────────────────────────────────────────────────────────

export function detectHallucinations(
  llmResponse: string,
  toolResults: ToolResult[],
  ragContext: string
): HallucinationCheckResult {
  const warnings: string[] = [];
  const text = llmResponse.toLowerCase();

  // ── Check 1: Empty vehicle search hallucination ────────────────────────────
  // Fires when search_vehicles returned 0 results but the LLM still claims
  // vehicles are available/shown.
  const searchResults = toolResults.filter((t) => t.tool === 'search_vehicles');

  for (const result of searchResults) {
    const isEmpty = isEmptySearchResult(result.data);
    if (isEmpty) {
      // Fixed hallucination logic — exclude phrases that correctly indicate no results
      const claimsAvailability =
        (text.includes('here is') || text.includes('here are') || text.includes('showing')) &&
        !text.includes('0 matches') &&
        !text.includes('no vehicles') &&
        !text.includes('no cars') &&
        !text.includes("couldn't find") &&
        !text.includes("don't see any") &&
        !text.includes('none available') &&
        !text.includes('no results');

      if (claimsAvailability) {
        warnings.push(
          'AI claimed vehicles are available, but pre-filtering confirmed 0 matches. ' +
          'Check that the LLM is reading total_matching from the FilteredSearchResult.'
        );
      }
    }
  }

  // ── Check 2: Price hallucination ───────────────────────────────────────────
  // The LLM should only quote prices that came from tool results or the KB.
  const mentionedPrices = extractPrices(llmResponse);
  if (mentionedPrices.length > 0) {
    const toolPrices = collectToolPrices(toolResults);
    const ragPrices  = extractPrices(ragContext);
    const allKnownPrices = new Set([...toolPrices, ...ragPrices]);

    for (const price of mentionedPrices) {
      if (!allKnownPrices.has(price)) {
        warnings.push(
          `AI mentioned price "$${price}" which does not appear in any tool result or knowledge base entry. ` +
          `Possible hallucination — the LLM may have invented this figure.`
        );
      }
    }
  }

  // ── Check 3: Policy hallucination ─────────────────────────────────────────
  // Policy assertions without RAG backing risk being invented by the LLM.
  const policyKeywords = ['policy', 'prohibited', 'not allowed', 'must', 'required', 'fee of', 'charge'];
  const makesPolicyClaim = policyKeywords.some((kw) => text.includes(kw));
  const hasRagContext = ragContext && ragContext.length > 50 &&
    ragContext !== 'No relevant information found in the knowledge base.';

  if (makesPolicyClaim && !hasRagContext) {
    warnings.push(
      'AI made policy or rules claims without any RAG context being retrieved. ' +
      'Verify the intentNeedsRag() classifier is firing correctly for this query type.'
    );
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns true if a search_vehicles tool result contains zero vehicles,
 * handling both the v3.1.0 masked format and the legacy raw array format.
 */
function isEmptySearchResult(data: unknown): boolean {
  if (!data) return true;

  // v3.1.0 masked format: { total_matching: 0, shown: [] }
  if (typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Partial<FilteredSearchResult>;
    if (d.total_matching !== undefined) return d.total_matching === 0;
    if (d.shown !== undefined)          return d.shown.length === 0;
  }

  // Legacy raw array format: TSearchedCar[]
  if (Array.isArray(data)) return data.length === 0;

  // JSON string (tool result stored as string in loopMessages)
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return isEmptySearchResult(parsed);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Extract dollar amounts from a text string.
 * Returns an array of numeric strings, e.g. ["120", "85"].
 */
function extractPrices(text: string): string[] {
  const matches = text.match(/\$(\d{1,6}(?:\.\d{1,2})?)/g) ?? [];
  return matches.map((m) => m.replace('$', ''));
}

/**
 * Collect all prices visible in tool results (masked + legacy formats).
 */
function collectToolPrices(toolResults: ToolResult[]): string[] {
  const prices: string[] = [];

  for (const tr of toolResults) {
    const raw = typeof tr.data === 'string' ? tr.data : JSON.stringify(tr.data ?? '');
    prices.push(...extractPrices(raw));

    // Also extract from nested shown[] for masked format
    if (tr.data && typeof tr.data === 'object' && !Array.isArray(tr.data)) {
      const d = tr.data as Partial<FilteredSearchResult>;
      if (Array.isArray(d.shown)) {
        for (const v of d.shown as MaskedVehicle[]) {
          if (v.dailyRate)  prices.push(String(v.dailyRate));
          if (v.hourlyRate) prices.push(String(v.hourlyRate));
        }
      }
    }
  }

  return prices;
}
