/**
 * Vehicle Filter & Masking Engine (v3.1.0 — Phase C)
 *
 * Prime Directive: LLMs should NOT do math or sorting.
 * All filtering, sorting, and payload trimming happens here in Node.js code
 * BEFORE the result is handed to the LLM.
 *
 * Search pipeline (94% token reduction):
 *   Tashus API returns 30 raw vehicles (150KB JSON, ~12,500 tokens)
 *   → filter()  : applies maxPrice, minSeats, vehicleType, transmission, fuelType
 *   → sortByPrice(): cheapest first (deterministic)
 *   → slice(0,5): top 5 only
 *   → mask()    : strip to 11 essential fields (~300 bytes each)
 *   Result: { total_matching, total_raw, shown: [5 vehicles] } ≈ 750 tokens
 *
 * Detail pipeline (90% token reduction):
 *   Raw vehicle detail (~50KB, ~5,000 tokens)
 *   → maskVehicleDetails(): keep only what the LLM needs to answer questions
 *   Result: ~500 tokens
 */

import type { TSearchedCar, TCarDataState } from './types';

// ── Masked types (what the LLM receives) ──────────────────────────────────────

export interface MaskedVehicle {
  listingId: number;
  displayName: string;        // "{year} {make} {model}"
  carType: string;
  seats: number;
  transmission: string;
  fuelType: string;
  dailyRate: number;          // AUD
  hourlyRate: number;         // AUD
  location: {
    city: string;
    state: string;
  };
  coverPhotoUrl: string;
  hostRating?: number;        // Average of totalRatings / ratingsReceivedFrom
}

export interface FilteredSearchResult {
  total_matching: number;     // How many passed all filters
  total_raw: number;          // How many the API returned
  shown: MaskedVehicle[];     // Top 5 by price (or fewer if less available)
  filters_applied: FilterCriteria;
}

export interface FilterCriteria {
  maxPrice?: number;
  minSeats?: number;
  vehicleType?: string;       // cType
  transmission?: string;      // tType
  fuelType?: string;          // fType
}

export interface MaskedVehicleDetails {
  listingId: number;
  displayName: string;
  carType: string;

  specs: {
    year: number;
    seats: number;
    doors: number;
    transmission: string;
    fuelType: string;
    odometer: string;         // e.g. "45,000 km"
  };

  rates: {
    daily: number;
    hourly: number;
    peakSurcharge?: string;       // e.g. "15% on Fri, Sat"
    weeklyDiscount?: string;      // e.g. "10% for 7+ days"
  };

  topFeatures: string[];          // Max 7

  description: string;            // HTML stripped, max 300 chars

  host: {
    name: string;
    totalTrips: number;
    rating: number;
  };

  rules: {
    advanceNoticeHours: number;
    minTripHours: number;
    maxTripDays?: number;
    dailyKmLimit?: number;
    extraKmFeePerKm?: number;
  };

  photos: {
    cover: string;
    gallery: string[];            // Max 3 additional
  };
}

// ── VehicleFilterEngine ───────────────────────────────────────────────────────

export class VehicleFilterEngine {

  // ── Step 1: Filter ───────────────────────────────────────────────────────────

  private applyFilters(vehicles: TSearchedCar[], criteria: FilterCriteria): TSearchedCar[] {
    let filtered = vehicles;

    if (criteria.maxPrice !== undefined) {
      const limit = criteria.maxPrice;
      filtered = filtered.filter(
        (v) => v.rates?.dailyRates?.amount !== undefined && v.rates.dailyRates.amount <= limit
      );
    }

    if (criteria.minSeats !== undefined) {
      const floor = criteria.minSeats;
      filtered = filtered.filter(
        (v) => v.car?.seats !== undefined && v.car.seats >= floor
      );
    }

    if (criteria.vehicleType) {
      const type = criteria.vehicleType.toLowerCase();
      filtered = filtered.filter(
        (v) => v.car?.carType?.toLowerCase() === type
      );
    }

    if (criteria.transmission) {
      const trans = criteria.transmission.toLowerCase();
      filtered = filtered.filter(
        (v) => v.car?.transmissionType?.toLowerCase() === trans
      );
    }

    if (criteria.fuelType) {
      const fuel = criteria.fuelType.toLowerCase();
      filtered = filtered.filter(
        (v) => v.car?.fuelType?.toLowerCase() === fuel
      );
    }

    return filtered;
  }

  // ── Step 2: Sort by daily rate, cheapest first ────────────────────────────────

  private sortByPrice(vehicles: TSearchedCar[]): TSearchedCar[] {
    return [...vehicles].sort((a, b) => {
      const priceA = a.rates?.dailyRates?.amount ?? Infinity;
      const priceB = b.rates?.dailyRates?.amount ?? Infinity;
      return priceA - priceB;
    });
  }

  // ── Step 3: Mask a single search result vehicle ──────────────────────────────

  private maskSearchVehicle(vehicle: TSearchedCar): MaskedVehicle {
    const hostRating =
      vehicle.ratingsReceivedFrom && vehicle.ratingsReceivedFrom > 0
        ? parseFloat((vehicle.totalRatings / vehicle.ratingsReceivedFrom).toFixed(1))
        : undefined;

    return {
      listingId: vehicle.listingId,
      displayName: `${vehicle.car.make} ${vehicle.car.model}`,
      carType: vehicle.car.carType,
      seats: vehicle.car.seats,
      transmission: vehicle.car.transmissionType,
      fuelType: vehicle.car.fuelType,
      dailyRate: vehicle.rates.dailyRates.amount,
      hourlyRate: vehicle.rates.hourlyRates?.amount ?? 0,
      location: {
        city: vehicle.location.pickupAddress.city,
        state: vehicle.location.pickupAddress.state,
      },
      coverPhotoUrl: vehicle.photos?.coverPhoto?.imageInfo?.secure_url ?? '',
      ...(hostRating !== undefined && { hostRating }),
    };
  }

  // ── Public: process search results ────────────────────────────────────────────

  public processSearchResults(
    rawVehicles: TSearchedCar[],
    criteria: FilterCriteria,
    topN: number = 5
  ): FilteredSearchResult {
    const filtered = this.applyFilters(rawVehicles, criteria);
    const sorted   = this.sortByPrice(filtered);
    const topSlice = sorted.slice(0, topN);
    const masked   = topSlice.map((v) => this.maskSearchVehicle(v));

    return {
      total_matching: filtered.length,
      total_raw: rawVehicles.length,
      shown: masked,
      filters_applied: criteria,
    };
  }

  // ── Public: mask a single vehicle detail view ─────────────────────────────────

  public maskVehicleDetails(vehicle: TCarDataState): MaskedVehicleDetails {
    // Strip HTML from description and guidelines
    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

    const rawDesc = vehicle.additionalInfos?.carDescription ?? '';
    const description = stripHtml(rawDesc).slice(0, 300) +
      (stripHtml(rawDesc).length > 300 ? '…' : '');

    // Odometer
    const mileage = vehicle.car?.mileage;
    const odometer = mileage?.distance
      ? `${mileage.distance.toLocaleString('en-AU')} ${mileage.units ?? 'km'}`
      : 'Not provided';

    // Peak surcharge summary
    let peakSurcharge: string | undefined;
    const peaks = (vehicle.rates?.peakIncrease ?? []) as any[];
    if (peaks.length > 0) {
      const p = peaks[0];
      if (p.increaseAmount && p.increaseDays?.length > 0) {
        peakSurcharge = `${p.increaseAmount}% on ${(p.increaseDays as string[]).join(', ')}`;
      }
    }

    // Weekly discount summary
    let weeklyDiscount: string | undefined;
    const discounts = (vehicle.rates?.longBookingDiscounts ?? []) as any[];
    if (discounts.length > 0) {
      const d = discounts[0];
      if (d.discountAmount && d.duration) {
        weeklyDiscount = `${d.discountAmount}% for ${d.duration}+ ${d.unit ?? 'days'}`;
      }
    }

    // Host rating
    const hostInfo = vehicle.hostInfo;
    const hostRating =
      hostInfo?.hostRatingCount && hostInfo.hostRatingCount > 0
        ? parseFloat((hostInfo.hostRatingTotal / hostInfo.hostRatingCount).toFixed(1))
        : 0;

    // Availability rules (cast because availability is typed as unknown in TCarDataState)
    const avail = vehicle.availability as any;

    // Gallery — max 3 additional photos
    const gallery = (vehicle.photos?.additionalPhotos ?? [])
      .slice(0, 3)
      .map((p) => p.imageInfo.secure_url)
      .filter(Boolean);

    return {
      listingId: vehicle.listingId,
      displayName: `${vehicle.car.year} ${vehicle.car.make} ${vehicle.car.model}`,
      carType: vehicle.car.carType,

      specs: {
        year: vehicle.car.year,
        seats: vehicle.car.seats,
        doors: vehicle.car.doors,
        transmission: vehicle.car.transmissionType,
        fuelType: vehicle.car.fuelType,
        odometer,
      },

      rates: {
        daily: vehicle.rates.dailyRates.amount,
        hourly: vehicle.rates.hourlyRates?.amount ?? 0,
        ...(peakSurcharge  && { peakSurcharge }),
        ...(weeklyDiscount && { weeklyDiscount }),
      },

      topFeatures: (vehicle.features ?? []).slice(0, 7),

      description,

      host: {
        name: hostInfo?.firstName ?? 'Host',
        totalTrips: hostInfo?.hostTotalTrips ?? 0,
        rating: hostRating,
      },

      rules: {
        advanceNoticeHours: avail?.noticeInAdvance?.hoursRequired ?? 0,
        minTripHours:       avail?.minTripDuration?.shortestDuration ?? 0,
        ...(avail?.maxTripDuration?.noMaximum === false && {
          maxTripDays: avail.maxTripDuration.longestDuration,
        }),
        ...(!vehicle.distance?.unlimitedTravel && {
          dailyKmLimit:      vehicle.distance?.maximumDailyDistance,
          extraKmFeePerKm:   vehicle.distance?.additionalFeePerKilometer,
        }),
      },

      photos: {
        cover: vehicle.photos?.coverPhoto?.imageInfo?.secure_url ?? '',
        gallery,
      },
    };
  }
}

// Singleton — shared across all adapter calls
export const vehicleFilterEngine = new VehicleFilterEngine();
