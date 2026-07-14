'use strict';
import React from 'react';

interface VehicleProps {
  id?: string | number;
  make?: string;
  model?: string;
  year?: number;
  dailyRate?: number;
  seats?: number;
  transmission?: string;
  imageUrl?: string;
  type?: string;
  remaining?: number;
  searchUrl?: string;
}

export default function VehicleResultCard({ vehicle }: { vehicle: VehicleProps }) {
  // ── "View More" variant ──────────────────────────────────────────────────
  if (vehicle.type === 'view_more') {
    const handleViewMore = () => {
      window.parent.location.href = vehicle.searchUrl || '/search';
    };

    return (
      <div className="w-full h-full bg-[#0F161E] border border-dashed border-[#F2994A]/40 rounded-xl overflow-hidden shadow-md my-2 flex flex-col items-center justify-center text-center min-h-[260px] p-4">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[#F2994A]/10 border border-[#F2994A]/30 flex items-center justify-center text-[#F2994A] text-lg font-black mb-3">
            +{vehicle.remaining ?? 0}
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

  // ── Standard vehicle card ────────────────────────────────────────────────
  const handleViewDetails = () => {
    window.parent.location.href = `/search/${vehicle.id}/vehicle-details`;
  };

  const formattedRate = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(vehicle.dailyRate ?? 0);

  return (
    <div className="w-full bg-[#0F161E] border border-[#1E293B] rounded-xl overflow-hidden shadow-md my-2 flex flex-col">
      {vehicle.imageUrl ? (
        <img
          src={vehicle.imageUrl}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="w-full h-28 object-cover bg-[#090D11]"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60';
          }}
        />
      ) : (
        <div className="w-full h-28 bg-[#090D11] flex items-center justify-center text-xs text-[#94A3B8]">
          No Image
        </div>
      )}
      
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="font-bold text-white text-[11px] leading-snug truncate">
            {vehicle.make} {vehicle.model}
          </h4>
          {vehicle.year && (
            <span className="text-[9px] text-[#94A3B8] font-normal">({vehicle.year})</span>
          )}

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] font-bold text-[#20B9BE] whitespace-nowrap">{formattedRate}/day</span>
          </div>

          <div className="flex items-center gap-2 text-[9px] text-[#94A3B8] mt-1.5 font-semibold">
            <span>👤 {vehicle.seats}</span>
            <span>⚙ {vehicle.transmission}</span>
          </div>
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
