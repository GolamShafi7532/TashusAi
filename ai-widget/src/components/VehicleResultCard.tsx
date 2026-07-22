'use strict';
import React from 'react';

/* ── Shape definitions ──────────────────────────────────────────── */
interface MaskedVehicle {
  listingId?: number;
  displayName?: string;
  carType?: string;
  seats?: number;
  transmission?: string;
  fuelType?: string;
  dailyRate?: number;
  location?: { city: string; state: string };
  coverPhotoUrl?: string;
  hostRating?: number;
}
interface LegacyVehicle {
  id?: string | number;
  make?: string;
  model?: string;
  year?: number;
  dailyRate?: number;
  seats?: number;
  transmission?: string;
  imageUrl?: string;
}
interface ViewMore {
  type: 'view_more';
  remaining?: number;
  searchUrl?: string;
}
type VehicleProps = (MaskedVehicle | LegacyVehicle | ViewMore) & { type?: string };

interface Normalised {
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

function normalise(v: any): Normalised {
  if (v.listingId !== undefined || v.coverPhotoUrl !== undefined || v.displayName !== undefined) {
    return {
      id: v.listingId ?? 0,
      displayName: v.displayName ?? 'Vehicle',
      dailyRate: v.dailyRate ?? 0,
      seats: v.seats,
      transmission: v.transmission,
      fuelType: v.fuelType,
      carType: v.carType,
      imageUrl: v.coverPhotoUrl ?? '',
      locationLabel: v.location ? `${v.location.city}, ${v.location.state}` : undefined,
      hostRating: v.hostRating,
    };
  }
  const name = [v.make, v.model, v.year ? `(${v.year})` : ''].filter(Boolean).join(' ');
  return {
    id: v.id ?? 0,
    displayName: name || 'Vehicle',
    dailyRate: v.dailyRate ?? 0,
    seats: v.seats,
    transmission: v.transmission,
    imageUrl: v.imageUrl ?? '',
  };
}

/* ── Component — fixed 158px wide ──────────────────────────────── */
export default function VehicleResultCard({ vehicle }: { vehicle: VehicleProps }) {

  /* View More */
  if ((vehicle as any).type === 'view_more') {
    const vm = vehicle as ViewMore;
    return (
      <div
        onClick={() => { window.parent.location.href = vm.searchUrl || '/search'; }}
        style={{
          width: '158px',
          height: '180px',
          background: 'rgba(128,19,127,0.04)',
          border: '1px dashed rgba(128,19,127,0.25)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          gap: '8px',
          padding: '12px',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,19,127,0.08)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.4)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,19,127,0.04)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.25)';
        }}
      >
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(128,19,127,0.12)',
          border: '1px solid rgba(128,19,127,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 800, color: '#80137f',
        }}>
          +{vm.remaining ?? 0}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>More vehicles</div>
        <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.45)', textAlign: 'center', lineHeight: 1.4 }}>
          See all on Tashus
        </div>
      </div>
    );
  }

  const v = normalise(vehicle);
  const rate = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v.dailyRate);

  return (
    <div
      style={{
        width: '158px',
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid rgba(128,19,127,0.15)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.15s',
        boxShadow: '0 2px 8px rgba(128,19,127,0.08)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.35)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(128,19,127,0.15)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.15)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(128,19,127,0.08)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Image */}
      <div style={{ position: 'relative', width: '100%', height: '80px', background: '#0a0a0a', flexShrink: 0 }}>
        {v.imageUrl ? (
          <img
            src={v.imageUrl}
            alt={v.displayName}
            style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&auto=format&fit=crop&q=60';
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '80px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px',
          }}>No image</div>
        )}
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)',
        }} />
        {/* Price badge */}
        <div style={{
          position: 'absolute', bottom: '5px', right: '5px',
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '6px',
          padding: '2px 6px',
          fontSize: '10px', fontWeight: 800, color: '#fff',
          lineHeight: 1.4,
        }}>
          {rate}
          <span style={{ fontSize: '8px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginLeft: '1px' }}>/day</span>
        </div>
      </div>

      {/* Details */}
      <div style={{ padding: '8px 9px 9px', flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {/* Name */}
        <div style={{
          fontSize: '11px', fontWeight: 700, color: '#1a1a1a',
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '28px',
        }}>
          {v.displayName}
        </div>

        {/* Specs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {v.carType && (
            <span style={{
              fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              color: '#80137f',
              background: 'rgba(128,19,127,0.1)', border: '1px solid rgba(128,19,127,0.2)',
              padding: '2px 4px', borderRadius: '4px',
            }}>{v.carType}</span>
          )}
          {v.seats && (
            <span style={{
              fontSize: '8px', color: 'rgba(0,0,0,0.5)', fontWeight: 500,
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
              padding: '2px 4px', borderRadius: '4px',
            }}>👤 {v.seats}</span>
          )}
          {v.transmission && (
            <span style={{
              fontSize: '8px', color: 'rgba(0,0,0,0.5)', fontWeight: 500,
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
              padding: '2px 4px', borderRadius: '4px',
            }}>{v.transmission}</span>
          )}
        </div>

        {/* Location + rating */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', minHeight: '16px' }}>
          {v.locationLabel && (
            <span style={{ fontSize: '8px', color: 'rgba(0,0,0,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}>
              📍 {v.locationLabel}
            </span>
          )}
          {v.hostRating !== undefined && v.hostRating > 0 && (
            <span style={{ fontSize: '8px', color: '#f97316', fontWeight: 700, flexShrink: 0 }}>
              ⭐ {v.hostRating}
            </span>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => { window.parent.location.href = `/search/${v.id}/vehicle-details`; }}
          style={{
            width: '100%',
            padding: '6px 0',
            marginTop: '3px',
            background: 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          View Details
        </button>
      </div>
    </div>
  );
}
