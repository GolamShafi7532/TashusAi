'use strict';
import React from 'react';

/**
 * VehicleResultCard (v3.1.0 — Phase C.5)
 *
 * Accepts two payload shapes:
 *
 * 1. Masked format (v3.1.0 FilteredSearchResult.shown[]):
 *    { listingId, displayName, carType, seats, transmission, fuelType,
 *      dailyRate, hourlyRate, location, coverPhotoUrl, hostRating? }
 *
 * 2. Legacy inline tag format (LLM mock / pre-filter):
 *    { id, make, model, year?, dailyRate, seats, transmission, imageUrl }
 *
 * 3. "View More" card:
 *    { type: 'view_more', remaining, searchUrl }
 *
 * The normalise() function maps both shapes to a common internal structure
 * so the render stays clean.
 */

// ── Masked vehicle shape (v3.1.0) ─────────────────────────────────────────────
interface MaskedVehicleProps {
  listingId?: number;
  displayName?: string;
  carType?: string;
  seats?: number;
  transmission?: string;
  fuelType?: string;
  dailyRate?: number;
  hourlyRate?: number;
  location?: { city: string; state: string };
  coverPhotoUrl?: string;
  hostRating?: number;
}

// ── Legacy inline tag shape ───────────────────────────────────────────────────
interface LegacyVehicleProps {
  id?: string | number;
  make?: string;
  model?: string;
  year?: number;
  dailyRate?: number;
  seats?: number;
  transmission?: string;
  imageUrl?: string;
}

// ── View More card ────────────────────────────────────────────────────────────
interface ViewMoreProps {
  type: 'view_more';
  remaining?: number;
  searchUrl?: string;
}

type VehicleProps = (MaskedVehicleProps | LegacyVehicleProps | ViewMoreProps) & {
  type?: string;
};

// ── Internal normalised shape ─────────────────────────────────────────────────
interface NormalisedVehicle {
  id: string | number;
  displayName: string;
  dailyRate: number;
  seats?: number;
  transmission?: string;
  fuelType?: string;
  carType?: string;
  imageUrl: string;
  locationLabel?: string;
  hostRating?: number;
}

function normalise(vehicle: VehicleProps): NormalisedVehicle {
  const v = vehicle as any;

  // v3.1.0 masked format — has listingId + displayName + coverPhotoUrl
  if (v.listingId !== undefined || v.coverPhotoUrl !== undefined || v.displayName !== undefined) {
    return {
      id:           v.listingId ?? 0,
      displayName:  v.displayName ?? 'Vehicle',
      dailyRate:    v.dailyRate ?? 0,
      seats:        v.seats,
      transmission: v.transmission,
      fuelType:     v.fuelType,
      carType:      v.carType,
      imageUrl:     v.coverPhotoUrl ?? '',
      locationLabel: v.location ? `${v.location.city}, ${v.location.state}` : undefined,
      hostRating:   v.hostRating,
    };
  }

  // Legacy inline tag format — has id + make + model + imageUrl
  const name = [v.make, v.model, v.year ? `(${v.year})` : ''].filter(Boolean).join(' ');
  return {
    id:           v.id ?? 0,
    displayName:  name || 'Vehicle',
    dailyRate:    v.dailyRate ?? 0,
    seats:        v.seats,
    transmission: v.transmission,
    imageUrl:     v.imageUrl ?? '',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VehicleResultCard({ vehicle }: { vehicle: VehicleProps }) {

  // ── View More card ──────────────────────────────────────────────────────────
  if ((vehicle as any).type === 'view_more') {
    const vm = vehicle as ViewMoreProps;
    const handleViewMore = () => {
      window.parent.location.href = vm.searchUrl || '/search';
    };

    return (
      <div className="w-full h-full bg-[#0F161E] border border-dashed border-[#F2994A]/40 rounded-xl overflow-hidden shadow-md my-2 flex flex-col items-center justify-center text-center min-h-[260px] p-4">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[#F2994A]/10 border border-[#F2994A]/30 flex items-center justify-center text-[#F2994A] text-lg font-black mb-3">
            +{vm.remaining ?? 0}
          </div>
          <h4 className="font-bold text-white text-xs mb-1">More Vehicles</h4>
          <p className="text-[9px] text-[#94A3B8] leading-relaxed px-2">
            See all matching results on Tashus
          </p>
        </div>
        <button
          onClick={handleViewMore}
          className="w-full mt-3 bg-[#F2994A] hover:bg-[#d97f2e] text-white text-[10px] font-bold py-2 rounded-lg transition-all text-center uppercase tracking-wider"
        >
          View All
        </button>
      </div>
    );
  }

  // ── Standard vehicle card ───────────────────────────────────────────────────
  const v = normalise(vehicle);

  const handleViewDetails = () => {
    window.parent.location.href = `/search/${v.id}/vehicle-details`;
  };

  const formattedRate = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(v.dailyRate);

  return (
    <div className="w-full bg-[#0F161E] border border-[#1E293B] rounded-xl overflow-hidden shadow-md my-2 flex flex-col">
      {/* Cover photo */}
      {v.imageUrl ? (
        <img
          src={v.imageUrl}
          alt={v.displayName}
          className="w-full h-28 object-cover bg-[#090D11]"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60';
          }}
        />
      ) : (
        <div className="w-full h-28 bg-[#090D11] flex items-center justify-center text-xs text-[#94A3B8]">
          No Image
        </div>
      )}

      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {/* Name */}
          <h4 className="font-bold text-white text-[11px] leading-snug truncate">
            {v.displayName}
          </h4>

          {/* carType badge */}
          {v.carType && (
            <span className="text-[8px] text-[#20B9BE] font-semibold uppercase tracking-wide">
              {v.carType}
            </span>
          )}

          {/* Price */}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] font-bold text-[#20B9BE] whitespace-nowrap">
              {formattedRate}/day
            </span>
            {/* Host rating if present */}
            {v.hostRating !== undefined && v.hostRating > 0 && (
              <span className="text-[9px] text-[#F2994A] font-semibold">
                ⭐ {v.hostRating}
              </span>
            )}
          </div>

          {/* Specs row */}
          <div className="flex items-center gap-2 text-[9px] text-[#94A3B8] mt-1.5 font-semibold flex-wrap">
            {v.seats      && <span>👤 {v.seats}</span>}
            {v.transmission && <span>⚙ {v.transmission}</span>}
            {v.fuelType   && <span>⛽ {v.fuelType}</span>}
          </div>

          {/* Location label (v3.1.0 only) */}
          {v.locationLabel && (
            <div className="text-[8px] text-[#94A3B8] mt-1 truncate">
              📍 {v.locationLabel}
            </div>
          )}
        </div>

        <button
          onClick={handleViewDetails}
          className="w-full mt-2.5 bg-[#F2994A] hover:bg-[#d97f2e] text-white text-[9px] font-bold py-1.5 rounded-lg transition-all text-center uppercase tracking-wider"
        >
          View Details
        </button>
      </div>
    </div>
  );
}
