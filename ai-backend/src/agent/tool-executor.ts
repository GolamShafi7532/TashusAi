/**
 * Tool call validation middleware (v3.1.0 — Phase A.1.3)
 *
 * Sits between the LLM output and the actual tool dispatch.
 * Catches malformed tool calls BEFORE they reach the Tashus adapter so
 * the adapter never has to deal with "null" strings, bad dates, or missing
 * required fields. On failure it returns a structured error that is fed back
 * to the LLM as a tool_result so it can self-correct in the next round.
 *
 * Validation checks:
 *  1. Literal "null" / null values in any parameter            → reject
 *  2. search_vehicles: at least one location param present     → reject if missing
 *  3. search_vehicles: ISO 8601 date format on from/to         → reject if malformed
 *  4. search_vehicles: from < to, both in the future           → reject if violated
 *  5. search_vehicles: minSeats ≥ 1, maxPrice > 0             → reject if violated
 */

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error fed back to the LLM as a tool_result so it can retry */
  error?: string;
}

// ── Public validator ───────────────────────────────────────────────────────────

export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>
): ValidationResult {

  // ── Rule 1: No literal "null" strings or actual null in any param ──────────
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === 'null' || value === 'undefined') {
      return {
        valid: false,
        error:
          `Parameter "${key}" must not be null. ` +
          `Either omit it entirely (if optional) or ask the user for this information before calling the tool.`,
      };
    }
  }

  // ── Rule 2–5: search_vehicles specific checks ──────────────────────────────
  if (toolName === 'search_vehicles') {
    return validateSearchVehicles(args);
  }

  // ── get_vehicle_details ────────────────────────────────────────────────────
  if (toolName === 'get_vehicle_details') {
    const id = args.listingId;
    if (id === undefined || id === '') {
      return { valid: false, error: '"listingId" is required for get_vehicle_details.' };
    }
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return { valid: false, error: '"listingId" must be a positive integer.' };
    }
  }

  // ── check_availability ────────────────────────────────────────────────────
  if (toolName === 'check_availability') {
    const id = args.carListingId;
    if (id === undefined || id === '') {
      return { valid: false, error: '"carListingId" is required for check_availability.' };
    }
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return { valid: false, error: '"carListingId" must be a positive integer.' };
    }
  }

  // ── validate_voucher ──────────────────────────────────────────────────────
  if (toolName === 'validate_voucher') {
    const slug = args.voucherSlug;
    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      return { valid: false, error: '"voucherSlug" is required and must be a non-empty string.' };
    }
  }

  // ── search_knowledge_base ──────────────────────────────────────────────────
  if (toolName === 'search_knowledge_base') {
    const query = args.query;
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return { valid: false, error: '"query" is required and must be a non-empty string.' };
    }
  }

  return { valid: true };
}

// ── search_vehicles sub-validator ─────────────────────────────────────────────

function validateSearchVehicles(args: Record<string, unknown>): ValidationResult {
  const { city, lat, long, from, to, minSeats, maxPrice } = args;

  // Rule 2: At least one location identifier
  const hasCity   = city  && typeof city  === 'string' && city.trim()  !== '';
  const hasLatLng = lat !== undefined && long !== undefined;

  if (!hasCity && !hasLatLng) {
    return {
      valid: false,
      error:
        'Location is required for search_vehicles. ' +
        'Provide "city" (e.g. "Sydney") or both "lat" and "long". ' +
        'If the user has not specified a location, ASK them before calling this tool.',
    };
  }

  // Rule 3: from and to must be valid ISO 8601
  if (!from || typeof from !== 'string') {
    return { valid: false, error: '"from" (pickup datetime) is required. Ask the user for pickup date/time.' };
  }
  if (!to || typeof to !== 'string') {
    return { valid: false, error: '"to" (return datetime) is required. Ask the user for return date/time.' };
  }

  if (!isValidISO8601(from)) {
    return {
      valid: false,
      error: `"from" value "${from}" is not a valid ISO 8601 datetime. Use format: "2026-07-16T10:00:00.000Z"`,
    };
  }
  if (!isValidISO8601(to)) {
    return {
      valid: false,
      error: `"to" value "${to}" is not a valid ISO 8601 datetime. Use format: "2026-07-17T10:00:00.000Z"`,
    };
  }

  // Rule 4: from must be before to, and from must be in the future
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  const now      = new Date();

  if (fromDate >= toDate) {
    return {
      valid: false,
      error: `Pickup date (from="${from}") must be strictly before return date (to="${to}").`,
    };
  }

  // Allow up to 24 hours in the past to cover:
  //  - Timezone differences (user in UTC+10 gives date that appears past in UTC)
  //  - Race conditions between the user typing and the request arriving
  //  - Groq using a slightly outdated "current date" from its training
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (fromDate < twentyFourHoursAgo) {
    const todayISO = now.toISOString().slice(0, 10);
    return {
      valid: false,
      error:
        `Pickup date "${from}" is too far in the past. ` +
        `Today's actual server date is ${todayISO} (UTC). ` +
        `Please recalculate using this date. For "this weekend", use the upcoming Saturday from ${todayISO}.`,
    };
  }

  // Rule 5: Numeric bounds
  if (minSeats !== undefined) {
    const seats = Number(minSeats);
    if (isNaN(seats) || seats < 1 || !Number.isInteger(seats)) {
      return { valid: false, error: '"minSeats" must be a positive integer (e.g. 5).' };
    }
  }

  if (maxPrice !== undefined) {
    const price = Number(maxPrice);
    if (isNaN(price) || price <= 0) {
      return { valid: false, error: '"maxPrice" must be a positive number in AUD (e.g. 120).' };
    }
  }

  return { valid: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validates that a string is a parseable ISO 8601 datetime.
 * Accepts both Z-suffixed and offset-suffixed forms.
 */
function isValidISO8601(value: string): boolean {
  // Must contain at minimum a date portion
  const iso8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!iso8601.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}
