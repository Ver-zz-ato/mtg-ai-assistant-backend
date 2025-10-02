"use client";
import React from "react";

export default function Tooltip({ content, children, side = "top" }: { content: string; children: React.ReactNode; side?: "top"|"bottom"|"left"|"right" }) {
  return (
    <span className="relative inline-block group">
      {children}
      <span
        className={`pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-black text-white px-2 py-1 rounded shadow-lg whitespace-nowrap z-50
        ${side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-1' : ''}
        ${side === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-1' : ''}
        ${side === 'left' ? 'right-full top-1/2 -translate-y-1/2 mr-1' : ''}
        ${side === 'right' ? 'left-full top-1/2 -translate-y-1/2 ml-1' : ''}
      `}
      >{content}</span>
    </span>
  );
}