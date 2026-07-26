/**
 * Tashus Read-Only Adapter — barrel export.
 *
 * This is the ONLY module the rest of the AI ecosystem imports
 * when it needs to call Tashus. Direct imports of client.ts or
 * endpoints.ts from outside this directory are forbidden by convention.
 *
 * Source of truth: AI Chatbot blueprint.md §3.2
 */

// Typed endpoint functions (what the agent tool dispatch table uses)
export {
  searchVehicles,
  getVehicleDetails,
  getBlockDatesByCar,
  getCommonVouchers,
  getVoucherBySlug,
  getDeliveryPrice,
} from './endpoints';

// Error classes (for type-safe error handling in the orchestrator)
export {
  TashusAdapterViolationError,
  TashusUpstreamError,
} from './client';

// Response types (for type-safe tool result rendering in the widget)
export type {
  TSearchedCar,
  TCarDataState,
  TBlockDatesResponse,
  TCarBlockDate,
  TVoucher,
  TVoucherRule,
  TDeliveryPriceResponse,
  THostInfo,
  TPhoto,
  TCarRate,
} from './types';

// v3.1.0 masked/filtered types (what the LLM and widget receive post-masking)
export type {
  MaskedVehicle,
  MaskedVehicleDetails,
  FilteredSearchResult,
  FilterCriteria,
} from './filter-engine';
