"use client";
import React from "react";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-0 overflow-x-auto md:overflow-visible">
      {/* Cost to Finish */}
      <a href="/collections/cost-to-finish" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="cost-to-finish">
        <img src="/Cost To Finish.png" alt="Cost to Finish" className="w-full h-auto" />
      </a>
      {/* Budget Swaps */}
      <a href="/deck/swap-suggestions" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="budget-swaps">
        <img src="/Budget Swaps.png" alt="Budget Swaps" className="w-full h-auto" />
      </a>
      {/* Price Tracker */}
      {riskyOn && (
        <a href="/price-tracker" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="price-tracker">
          <img src="/Price Tracker.png" alt="Price Tracker" className="w-full h-auto" />
        </a>
      )}
      {/* Mulligan Simulator */}
      <a href="/tools/mulligan" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="mulligan">
        <img src="/Mulligan Simulator.png" alt="Mulligan Simulator" className="w-full h-auto" />
      </a>
      {/* Probability Helpers */}
      <a href="/tools/probability" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="probability">
        <img src="/Probability Helpers.png" alt="Probability Helpers" className="w-full h-auto" />
      </a>
    </div>
  );
}
