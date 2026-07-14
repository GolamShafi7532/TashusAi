/**
 * Typed endpoint functions — one per allow-listed Tashus REST endpoint.
 * These are what the Agent Orchestrator's tool dispatch table calls.
 *
 * Every function here maps 1:1 to an entry in ALLOWED_ENDPOINTS in client.ts.
 * There is no "call any URL" escape hatch.
 *
 * Source of truth: AI Chatbot blueprint.md §3.2 & Tashus blueprint.md §4
 */
import { tashusGet } from './client';
import type {
  TSearchedCar,
  TCarDataState,
  TBlockDatesResponse,
  TVoucher,
  TDeliveryPriceResponse,
} from './types';

// ── Search vehicles by location + date range ──────────────────────────────────
// Maps to: GET /search/find-cars

export interface SearchVehiclesParams {
  city?: string;
  country?: string;
  postcode?: string;
  region?: string;
  lat?: number;
  long?: number;
  from: string;         // ISO datetime UTC
  to: string;           // ISO datetime UTC
  currentDateTime?: string;
  cType?: string;
  fType?: string;
  tType?: string;
  year?: number;
  color?: string;
  seats?: number;
  maxPrice?: number;
}

export async function searchVehicles(
  params: SearchVehiclesParams,
  sessionId?: string | null
): Promise<TSearchedCar[]> {
  // Auto-inject currentDateTime if not provided by the LLM tool call
  const enrichedParams = {
    ...params,
    currentDateTime: params.currentDateTime ?? new Date().toISOString(),
  };

  console.log(`[TashusAdapter] searchVehicles called with params:`, JSON.stringify(enrichedParams));

  // Extract non-endpoint filters so they aren't sent directly to query parameters
  const { seats, maxPrice, ...apiParams } = enrichedParams;

  const result = await tashusGet<{ results: TSearchedCar[] }>('/search/find-cars', {
    sessionId,
    toolName: 'search_vehicles',
    params: apiParams as unknown as Record<string, string | number>,
  });
  // Tashus wraps results in { results: [...] }
  let vehicles = result.results ?? (result as unknown as TSearchedCar[]);
  console.log(`[TashusAdapter] Raw searchVehicles returned ${Array.isArray(vehicles) ? vehicles.length : 0} vehicles`);

  // Apply post-filtering for seats (if specified)
  if (seats) {
    const minSeats = Number(seats);
    vehicles = vehicles.filter(v => v.car?.seats && v.car.seats >= minSeats);
    console.log(`[TashusAdapter] Filtered by seats >= ${minSeats}: ${vehicles.length} remaining`);
  }

  // Apply post-filtering for price (if specified)
  if (maxPrice) {
    const limit = Number(maxPrice);
    vehicles = vehicles.filter(v => v.rates?.dailyRates?.amount && v.rates.dailyRates.amount <= limit);
    console.log(`[TashusAdapter] Filtered by maxPrice <= ${limit}: ${vehicles.length} remaining`);
  }

  return vehicles;
}


// ── Get full vehicle detail by listing ID ─────────────────────────────────────
// Maps to: GET /search/find-cars/:listingId

export async function getVehicleDetails(
  listingId: number,
  sessionId?: string | null
): Promise<TCarDataState> {
  return tashusGet<TCarDataState>(`/search/find-cars/${listingId}`, {
    sessionId,
    toolName: 'get_vehicle_details',
  });
}

// ── Get block dates for a vehicle (live availability windows) ─────────────────
// Maps to: GET /reservation/block-dates-by-car/:carListingId

export async function getBlockDatesByCar(
  carListingId: number,
  sessionId?: string | null
): Promise<TBlockDatesResponse> {
  return tashusGet<TBlockDatesResponse>(
    `/reservation/block-dates-by-car/${carListingId}`,
    {
      sessionId,
      toolName: 'check_availability',
    }
  );
}

// ── Get all publicly active vouchers ─────────────────────────────────────────
// Maps to: GET /voucher/get-common-vouchers

export async function getCommonVouchers(
  sessionId?: string | null
): Promise<TVoucher[]> {
  return tashusGet<TVoucher[]>('/voucher/get-common-vouchers', {
    sessionId,
    toolName: 'get_promotions',
  });
}

// ── Get single voucher detail by public slug ──────────────────────────────────
// Maps to: GET /v2/voucher/slug/:voucherSlug

export async function getVoucherBySlug(
  voucherSlug: string,
  sessionId?: string | null
): Promise<TVoucher> {
  return tashusGet<TVoucher>(`/v2/voucher/slug/${voucherSlug}`, {
    sessionId,
    toolName: 'validate_voucher',
  });
}

// ── Calculate delivery price by driving distance ──────────────────────────────
// Maps to: GET /search/vehicle-delivery-price/:drivingDistanceInKm
// This is a pure calculation endpoint — not a mutation.

export async function getDeliveryPrice(
  drivingDistanceInKm: number,
  sessionId?: string | null
): Promise<TDeliveryPriceResponse> {
  return tashusGet<TDeliveryPriceResponse>(
    `/search/vehicle-delivery-price/${drivingDistanceInKm}`,
    {
      sessionId,
      toolName: 'get_delivery_price',
    }
  );
}
