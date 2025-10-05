"use client";
import React from "react";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  // If a custom badges strip is present, render that instead
  const [customBadges, setCustomBadges] = React.useState<React.ComponentType | null>(null);
  React.useEffect(() => {
    // Try loading custom badges modules dynamically
    const tryLoad = async () => {
      const paths = ["@/Badges/TopBadges", "@/badges/TopBadges", "@/badges/TopRow", "@/badges/index"];
      for (const path of paths) {
        try {
          const mod = await import(path);
          if (mod?.default) {
            setCustomBadges(() => mod.default);
            return;
          }
        } catch {}
      }
    };
    tryLoad();
  }, []);
  
  if (customBadges) {
    return (
      <div className="w-full m-0 p-0">
        {React.createElement(customBadges)}
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-0 overflow-x-auto md:overflow-visible">
      {/* Cost to Finish */}
      <a href="/collections/cost-to-finish" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
        <img src="/Cost To Finish.png" alt="Cost to Finish" className="w-full h-auto" />
      </a>
      {/* Budget Swaps */}
      <a href="/deck/swap-suggestions" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
        <img src="/Budget Swaps.png" alt="Budget Swaps" className="w-full h-auto" />
      </a>
      {/* Price Tracker */}
      {riskyOn && (
        <a href="/price-tracker" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
          <img src="/Price Tracker.png" alt="Price Tracker" className="w-full h-auto" />
        </a>
      )}
      {/* Mulligan Simulator */}
      <a href="/tools/mulligan" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
        <img src="/Mulligan Simulator.png" alt="Mulligan Simulator" className="w-full h-auto" />
      </a>
      {/* Probability Helpers */}
      <a href="/tools/probability" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
        <img src="/Probability Helpers.png" alt="Probability Helpers" className="w-full h-auto" />
      </a>
    </div>
  );
}
