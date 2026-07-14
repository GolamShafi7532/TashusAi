'use strict';
import React from 'react';

interface ToolActivityProps {
  toolName: string;
}

export default function ToolActivityChip({ toolName }: { toolName: string }) {
  const getFriendlyMessage = (name: string) => {
    switch (name) {
      case 'search_vehicles':
        return 'Searching matching vehicles...';
      case 'check_availability':
        return 'Checking live availability...';
      case 'validate_voucher':
        return 'Validating promotional coupon...';
      case 'search_knowledge_base':
        return 'Retrieving policy guides...';
      default:
        return `Calling internal database (${name})...`;
    }
  };

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE] my-1"
      style={{
        animation: 'w-pulse 1.5s infinite ease-in-out'
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#20B9BE] animate-ping" />
      <span>{getFriendlyMessage(toolName)}</span>
    </div>
  );
}
