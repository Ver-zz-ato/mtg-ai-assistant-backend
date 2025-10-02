"use client";
import React from "react";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 overflow-x-auto md:overflow-visible">
      {/* W (White) */}
<a href="/collections/cost-to-finish" className="block rounded-xl border border-neutral-300 bg-white text-neutral-900 p-4 hover:border-neutral-400">
<div className="font-semibold mb-1">Cost to Finish</div>
        <div className="text-xs opacity-70">Estimate what you still need to buy. Owned, Missing, prices, CSV export.</div>
      </a>
      {/* U (Blue) */}
      <a href="/deck/swap-suggestions" className="block rounded-xl border border-sky-700 bg-sky-900/20 p-4 hover:border-sky-600 hover:bg-sky-900/30">
        <div className="font-semibold mb-1">Budget Swaps</div>
        <div className="text-xs opacity-70">Find cheaper alternatives to pricey cards in your deck.</div>
      </a>
      {/* B (Black) */}
      {riskyOn && (
      <a href="/price-tracker" className="block rounded-xl border border-purple-900 bg-black/30 p-4 hover:border-purple-700 hover:bg-black/40">
        <div className="font-semibold mb-1">Price Tracker</div>
        <div className="text-xs opacity-70">Daily price snapshots with interactive charts. Watch cards, compare trends, export data.</div>
      </a>
      )}
      {/* R (Red) */}
      <a href="/tools/probability" className="block rounded-xl border border-red-700 bg-red-900/20 p-4 hover:border-red-600 hover:bg-red-900/30">
        <div className="font-semibold mb-1">Probability Helpers</div>
        <div className="text-xs opacity-70">Odds of drawing X by turn N (hypergeometric).
        </div>
      </a>
      {/* G (Green) */}
      <a href="/tools/mulligan" className="block rounded-xl border border-green-700 bg-green-900/20 p-4 hover:border-green-600 hover:bg-green-900/30">
        <div className="font-semibold mb-1">Hand / Mulligan Simulator</div>
        <div className="text-xs opacity-70">Approximate keep rates with simple London mulligan logic.</div>
      </a>
    </div>
  );
}