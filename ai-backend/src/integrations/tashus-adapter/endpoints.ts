/**
 * Typed endpoint functions — one per allow-listed Tashus REST endpoint.
 * These are what the Agent Orchestrator's tool dispatch table calls.
 *
 * Every function here maps 1:1 to an entry in ALLOWED_ENDPOINTS in client.ts.
 * There is no "call any URL" escape hatch.
 *
 * v3.1.0 Changes (Phase B.1.3 + Phase C):
 *  - searchVehicles: fetches pageSize=30 (generous), then applies code-level
 *    filter + sort + mask via VehicleFilterEngine. Returns FilteredSearchResult
 *    (~750 tokens) instead of raw TSearchedCar[] (~12,500 tokens). 94% reduction.
 *  - getVehicleDetails: applies maskVehicleDetails() before returning.
 *    Returns MaskedVehicleDetails (~500 tokens) instead of raw TCarDataState
 *    (~5,000 tokens). 90% reduction.
 *
 * Source of truth: AI Chatbot blueprint.md §3.2 & Tashus blueprint.md §4
 */
import { tashusGet } from './client';
import { vehicleFilterEngine, FilterCriteria, FilteredSearchResult, MaskedVehicleDetails } from './filter-engine';
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
  from: string;             // ISO datetime UTC
  to: string;               // ISO datetime UTC
  currentDateTime?: string;
  // Filter params — extracted here, NOT forwarded to Tashus API (it doesn't support them)
  cType?: string;
  fType?: string;
  tType?: string;
  minSeats?: number;        // v3.1.0: renamed from seats, floor-limit semantics
  seats?: number;           // kept for backwards compat — maps to minSeats
  maxPrice?: number;
  year?: number;
  color?: string;
}

export async function searchVehicles(
  params: SearchVehiclesParams,
  sessionId?: string | null
): Promise<FilteredSearchResult> {
  // Auto-inject currentDateTime if not provided
  const enrichedParams = {
    ...params,
    currentDateTime: params.currentDateTime ?? new Date().toISOString(),
  };

  console.log(`[TashusAdapter] searchVehicles called with params:`, JSON.stringify(enrichedParams));

  // Extract filter criteria (NOT sent to Tashus API)
  const filterCriteria: FilterCriteria = {
    maxPrice:     enrichedParams.maxPrice,
    minSeats:     enrichedParams.minSeats ?? enrichedParams.seats,
    vehicleType:  enrichedParams.cType,
    transmission: enrichedParams.tType,
    fuelType:     enrichedParams.fType,
  };

  // Strip filter-only fields before building API query params
  const {
    minSeats: _minSeats, seats: _seats, maxPrice: _maxPrice,
    cType: _cType, tType: _tType, fType: _fType,
    year: _year, color: _color,
    ...apiOnlyParams
  } = enrichedParams;

  // Build the API params — generous fetch of 30 so code-level filtering has
  // enough candidates. Tashus API does support cType/tType/fType so still pass those.
  const apiParams: Record<string, string | number> = {
    ...apiOnlyParams as any,
    ...(enrichedParams.cType  && { cType:  enrichedParams.cType }),
    ...(enrichedParams.tType  && { tType:  enrichedParams.tType }),
    ...(enrichedParams.fType  && { fType:  enrichedParams.fType }),
    page:     1,
    pageSize: 30,    // generous fetch — more than enough to filter down to 5
  };

  const response = await tashusGet<{ results: TSearchedCar[] } | TSearchedCar[]>(
    '/search/find-cars',
    {
      sessionId,
      toolName: 'search_vehicles',
      params: apiParams,
    }
  );

  // Normalise — Tashus wraps in { results: [...] }
  const rawVehicles: TSearchedCar[] = Array.isArray(response)
    ? response
    : (response as any).results ?? [];

  console.log(`[TashusAdapter] Raw searchVehicles returned ${rawVehicles.length} vehicles`);

  // Apply code-level filter + sort + mask (the 94% token reduction)
  const result = vehicleFilterEngine.processSearchResults(rawVehicles, filterCriteria);

  console.log(
    `[TashusAdapter] After filtering: ${result.total_matching}/${result.total_raw} match, ` +
    `showing top ${result.shown.length} masked vehicles`
  );

  return result;
}


// ── Get full vehicle detail by listing ID ─────────────────────────────────────
// Maps to: GET /search/find-cars/:listingId

export async function getVehicleDetails(
  listingId: number,
  sessionId?: string | null
): Promise<MaskedVehicleDetails> {
  const raw = await tashusGet<TCarDataState>(`/search/find-cars/${listingId}`, {
    sessionId,
    toolName: 'get_vehicle_details',
  });

  // Apply detail masking (90% token reduction)
  return vehicleFilterEngine.maskVehicleDetails(raw);
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
