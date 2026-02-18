'use client';
import React from 'react';

export default function Logo({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <img 
      src="/OFFICIAL_LOGO_SMALL_nobg%20%281%29.png" 
      alt="ManaTap Logo" 
      className={className}
      width={size}
      height={size}
      style={{
        width: size,
        height: size
      }}
    />
  );
}
