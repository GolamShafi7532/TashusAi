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
      carType: v.carType,
      imageUrl: v.coverPhotoUrl ?? '',
      locationLabel: v.location ? `${v.location.city}` : undefined,
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

// Fixed card height so all cards in a row are identical
const CARD_HEIGHT = 220;
const IMAGE_HEIGHT = 90;

export default function VehicleResultCard({ vehicle }: { vehicle: VehicleProps }) {

  /* ── View More card ─────────────────────────────────────────────── */
  if ((vehicle as any).type === 'view_more') {
    const vm = vehicle as ViewMore;
    return (
      <div
        onClick={() => { window.parent.location.href = vm.searchUrl || '/search'; }}
        style={{
          width: '158px',
          height: `${CARD_HEIGHT}px`,
          background: 'rgba(128,19,127,0.04)',
          border: '1.5px dashed rgba(128,19,127,0.3)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          gap: '8px',
          padding: '12px',
          transition: 'all 0.15s',
          boxSizing: 'border-box',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,19,127,0.08)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.5)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,19,127,0.04)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(128,19,127,0.3)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        }}
      >
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(128,19,127,0.12)',
          border: '1.5px solid rgba(128,19,127,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 800, color: '#80137f',
        }}>
          +{vm.remaining ?? 0}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.4 }}>
          More vehicles
        </div>
        <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.45)', textAlign: 'center', lineHeight: 1.4 }}>
          See all on Tashus
        </div>
        {/* Arrow icon */}
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#80137f" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    );
  }

  /* ── Vehicle card ───────────────────────────────────────────────── */
  const v = normalise(vehicle);
  const rate = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
  }).format(v.dailyRate);

  return (
    <div
      style={{
        width: '158px',
        height: `${CARD_HEIGHT}px`,      // fixed height — all cards identical
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(128,19,127,0.15)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.15s',
        boxShadow: '0 2px 8px rgba(128,19,127,0.08)',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'rgba(128,19,127,0.35)';
        el.style.boxShadow = '0 6px 20px rgba(128,19,127,0.18)';
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'rgba(128,19,127,0.15)';
        el.style.boxShadow = '0 2px 8px rgba(128,19,127,0.08)';
        el.style.transform = 'translateY(0)';
      }}
    >
      {/* ── Image ── fixed height */}
      <div style={{ position: 'relative', width: '100%', height: `${IMAGE_HEIGHT}px`, flexShrink: 0, background: '#111' }}>
        {v.imageUrl ? (
          <img
            src={v.imageUrl}
            alt={v.displayName}
            style={{ width: '100%', height: `${IMAGE_HEIGHT}px`, objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&auto=format&fit=crop&q=60';
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: `${IMAGE_HEIGHT}px`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.25)', fontSize: '10px',
          }}>No image</div>
        )}
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)',
          pointerEvents: 'none',
        }} />
        {/* Price badge */}
        <div style={{
          position: 'absolute', bottom: '5px', right: '5px',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          padding: '2px 6px',
          fontSize: '10px', fontWeight: 800, color: '#fff',
          lineHeight: 1.4,
        }}>
          {rate}
          <span style={{ fontSize: '8px', fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginLeft: '1px' }}>/day</span>
        </div>
      </div>

      {/* ── Details — fills remaining fixed height */}
      <div style={{
        flex: 1,
        padding: '7px 8px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        overflow: 'hidden',   // prevents content from stretching the card
      }}>
        {/* Name — clamp to 2 lines, fixed height */}
        <div style={{
          fontSize: '11px', fontWeight: 700, color: '#1a1a1a',
          lineHeight: 1.35,
          height: '30px',           // exactly 2 lines
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {v.displayName}
        </div>

        {/* Spec pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', minHeight: '18px' }}>
          {v.carType && (
            <span style={{
              fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              color: '#80137f', background: 'rgba(128,19,127,0.1)', border: '1px solid rgba(128,19,127,0.2)',
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

        {/* Location + rating row — fixed height */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: '14px', overflow: 'hidden',
        }}>
          {v.locationLabel ? (
            <span style={{
              fontSize: '8px', color: 'rgba(0,0,0,0.4)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '95px',
            }}>
              📍 {v.locationLabel}
            </span>
          ) : <span />}
          {v.hostRating !== undefined && v.hostRating > 0 && (
            <span style={{ fontSize: '8px', color: '#f97316', fontWeight: 700, flexShrink: 0 }}>
              ⭐ {v.hostRating}
            </span>
          )}
        </div>

        {/* CTA — always at the bottom, pushed by flex */}
        <button
          onClick={() => { window.parent.location.href = `/search/${v.id}/vehicle-details`; }}
          style={{
            width: '100%',
            marginTop: 'auto',
            padding: '6px 0',
            background: 'linear-gradient(135deg, #80137f 0%, #9d1b9c 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          View Details →
        </button>
      </div>
    </div>
  );
}
