"use client";
import React from "react";

export function HelpTip({ text, className }: { text: string; className?: string }){
  return (
    <span
      className={"ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-800 text-[11px] leading-none cursor-help select-none border border-neutral-700 " + (className||"")}
      title={text}
      aria-label="Help"
    >
      i
    </span>
  );
}

export function ELI5({ heading = "What is this?", items = [] as string[] }: { heading?: string; items: string[] }){
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="font-medium mb-1">ELI5 — {heading}</div>
      <ul className="list-disc pl-5 text-sm space-y-1">
        {items.map((s, i)=> (<li key={i}>{s}</li>))}
      </ul>
    </div>
  );
}
