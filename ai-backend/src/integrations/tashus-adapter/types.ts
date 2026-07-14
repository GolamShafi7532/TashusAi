/**
 * Response DTOs for the Tashus Read-Only Adapter.
 * Mirrored from Tashus_Frontend_V1 blueprint.md §3 (data models) and §4 (API).
 *
 * IMPORTANT: These types describe what the Tashus API *returns*.
 * They are read-only snapshots — the AI ecosystem never writes these shapes back.
 *
 * Source of truth: AI Chatbot blueprint.md §3.2
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

export interface TPhoto {
  imageInfo: {
    public_id: string;
    secure_url: string;
    format: string;
    bytes?: number;
    originalHeight?: number;
    originalWidth?: number;
  };
  storageProvider?: string;
}

export interface TCarRate {
  currency: string;
  amount: number;
}

export interface TCarBlockDate {
  _id: string;
  start: string; // ISO UTC date string
  end: string;   // ISO UTC date string
  title: string;
  createdAt: string;
}

export interface TBlockDatesResponse {
  allDayList: TCarBlockDate[]; // start=00:00:00 UTC, end=23:59:59 UTC
  customList: TCarBlockDate[]; // specific hour ranges
}

// ── Search result (partial vehicle projection) ────────────────────────────────
// Matches TSearchedCar from Tashus_Frontend_V1 — only the fields returned
// by GET /search/find-cars (not the full CarDataState).

export interface TSearchedCar {
  _id: string;
  listingId: number;
  hostId: string;
  availability: {
    pickupReturnHour: {
      alwaysAvailable: boolean;
      customAvailability?: unknown[];
    };
    noticeInAdvance: {
      alwaysAvailableImmediately: boolean;
      hoursRequired?: number;
    };
    minTripDuration: {
      noMinimum: boolean;
      unit: string;
      shortestDuration: number;
    };
    maxTripDuration: {
      noMaximum: boolean;
      unit: string;
      longestDuration: number;
    };
  };
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  location: {
    pickupAddress: {
      city: string;
      state: string;
      street: string;
      coordinates: [number, number]; // [lng, lat]
    };
  };
  car: {
    make: string;
    model: string;
    transmissionType: string;
    seats: number;
    carType: string;
    fuelType: string;
  };
  rates: {
    hourlyRates: TCarRate;
    dailyRates: TCarRate;
  };
  photos: {
    coverPhoto: TPhoto;
  };
  isNoticeHourRequired?: boolean;
}

// ── Full vehicle detail (returned by GET /search/find-cars/:id) ───────────────

export interface THostInfo {
  firstName: string;
  lastName: string;
  joiningDate?: string;
  picture?: { imageInfo: { public_id: string; secure_url: string; format: string } };
  hostTotalTrips: number;
  hostRatingCount: number;
  hostRatingTotal: number;
  username?: string;
  createdAt?: string;
}

export interface TCarDataState {
  _id: string;
  hostId: string;
  listingId: number;
  listingStatus: string;
  carNickName: string;
  car: {
    licensePlate: { number: string; state: string };
    vin: string;
    make: string;
    model: string;
    year: number;
    color: string;
    carType: string;
    seats: number;
    doors: number;
    windows: number;
    fuelType: string;
    transmissionType: string;
    trim: string;
    expiry: string;
    mileage: { distance: number; units: string };
  };
  features: string[];
  additionalFeatures: string[];
  additionalInfos: {
    carDescription: string;
    guidelines: string;
  };
  location: {
    pickupAddress: {
      city: string;
      state: string;
      street: string;
      postalCode?: string;
      coordinates: [number, number];
    };
    parkingInstructions: string;
  };
  availability: unknown;
  rates: {
    hourlyRates: TCarRate;
    dailyRates: TCarRate;
    peakIncrease: unknown[];
    longBookingDiscounts: unknown[];
    advanceBookingDiscounts: unknown[];
    customPricing: unknown[];
  };
  photos: {
    coverPhoto: TPhoto;
    additionalPhotos: TPhoto[];
  };
  distance: {
    unlimitedTravel: boolean;
    maximumDailyDistance: number;
    additionalFeePerKilometer: number;
  };
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  hostInfo?: THostInfo;
}

// ── Voucher ────────────────────────────────────────────────────────────────────

export interface TVoucherRule {
  id: string;
  field: string;
  operator: string;
  valueSource: string;
  value: unknown;
}

export interface TVoucher {
  _id: string;
  promotionId: string;
  voucherCode: string;
  voucherSlug: string;
  voucherTitle: string;
  description: string;
  discountType: 'fixed' | 'percentage';
  discountAmount: number;
  maxDiscountAmount: number | null;
  maxUsageCount: number;
  maxUsagePerUser: number;
  voucherUsageCount: number;
  voucherUsageAmount: number;
  isActive: boolean;
  isPaused: boolean;
  isPublic: boolean;
  isExpired: boolean;
  activateAt?: string;
  expiresAt: string;
  voucherRules: TVoucherRule[];
  voucherImages: { public_id: string; secure_url: string }[];
  voucherTerms?: unknown;
  applicableUserDescription?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Delivery price ─────────────────────────────────────────────────────────────

export interface TDeliveryPriceResponse {
  fee: number;
  currency: string;
}
