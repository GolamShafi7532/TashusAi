'use strict';
import React from 'react';

export default function StreamingCursor() {
  return (
    <span
      className="inline-block w-1.5 h-3.5 bg-[#20B9BE] ml-0.5 align-middle"
      style={{
        animation: 'w-blink 0.8s infinite step-end'
      }}
    />
  );
}
