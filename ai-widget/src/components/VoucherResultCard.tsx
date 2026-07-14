'use strict';
import React from 'react';

interface VoucherProps {
  code: string;
  discountAmount?: string | number;
  description?: string;
  expiryDate?: string;
  slug?: string;
}

export default function VoucherResultCard({ voucher }: { voucher: VoucherProps }) {
  const handleViewOffer = () => {
    const slug = voucher.slug || voucher.code.toLowerCase();
    window.parent.location.href = `/promotion/${slug}`;
  };

  return (
    <div className="w-full bg-[#0F161E] border-2 border-dashed border-[#F2994A]/40 rounded-xl p-4 my-2 flex flex-col justify-between shadow-md">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="bg-[#F2994A]/10 border border-[#F2994A]/30 text-[#F2994A] px-2.5 py-1 rounded-lg text-xs font-mono font-bold tracking-wider">
            {voucher.code}
          </span>
          {voucher.discountAmount && (
            <span className="text-xs font-black text-white bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-400">
              {voucher.discountAmount} Off
            </span>
          )}
        </div>

        {voucher.description && (
          <p className="text-xs text-[#94A3B8] leading-relaxed mb-3">{voucher.description}</p>
        )}

        {voucher.expiryDate && (
          <div className="text-[9px] text-[#475569] font-semibold">
            ⏰ Expires: {new Date(voucher.expiryDate).toLocaleDateString()}
          </div>
        )}
      </div>

      <button
        onClick={handleViewOffer}
        className="w-full mt-3 bg-[#F2994A] hover:bg-[#d97f2e] text-white text-[10px] font-bold py-2 rounded-lg transition-all text-center uppercase tracking-wider"
      >
        View Offer
      </button>
    </div>
  );
}
