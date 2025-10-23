"use client";
import React from "react";
import Image from "next/image";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-0 overflow-x-auto md:overflow-visible">
      {/* Cost to Finish */}
      <a href="/collections/cost-to-finish" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="cost-to-finish">
        <Image src="/Cost To Finish.png" alt="Cost to Finish" width={400} height={200} className="w-full h-auto" priority />
      </a>
      {/* Budget Swaps */}
      <a href="/deck/swap-suggestions" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="budget-swaps">
        <Image src="/Budget Swaps.png" alt="Budget Swaps" width={400} height={200} className="w-full h-auto" priority />
      </a>
      {/* Price Tracker */}
      {riskyOn && (
        <a href="/price-tracker" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="price-tracker">
          <Image src="/Price Tracker.png" alt="Price Tracker" width={400} height={200} className="w-full h-auto" priority />
        </a>
      )}
      {/* Mulligan Simulator */}
      <a href="/tools/mulligan" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="mulligan">
        <Image src="/Mulligan Simulator.png" alt="Mulligan Simulator" width={400} height={200} className="w-full h-auto" priority />
      </a>
      {/* Probability Helpers */}
      <a href="/tools/probability" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]" data-tour="probability">
        <Image src="/Probability Helpers.png" alt="Probability Helpers" width={400} height={200} className="w-full h-auto" priority />
      </a>
    </div>
  );
}
