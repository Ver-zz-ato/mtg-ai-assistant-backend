"use client";
import React from "react";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 overflow-x-auto md:overflow-visible">
      {/* 💰 Cost to Finish (White) */}
      <a href="/collections/cost-to-finish" className="block rounded-xl border border-white/70 bg-neutral-950 p-4 hover:border-white hover:shadow-[0_0_12px_rgba(255,255,255,0.35)] transition">
        <div className="font-semibold mb-1">💰 Cost to Finish</div>
        <div className="text-xs opacity-70">What’s left to buy?</div>
      </a>
      {/* 🔄 Budget Swaps (Blue) */}
      <a href="/deck/swap-suggestions" className="block rounded-xl border border-sky-600/70 bg-neutral-950 p-4 hover:border-sky-400 hover:shadow-[0_0_12px_rgba(56,189,248,0.35)] transition">
        <div className="font-semibold mb-1">🔄 Budget Swaps</div>
        <div className="text-xs opacity-70">Trade power for pennies.</div>
      </a>
      {/* 📈 Price Tracker (Black) */}
      {riskyOn && (
        <a href="/price-tracker" className="block rounded-xl border border-black bg-white/10 p-4 hover:border-black hover:bg-white/15 hover:shadow-[0_0_12px_rgba(0,0,0,0.5)] transition">
          <div className="font-semibold mb-1">📈 Price Tracker</div>
          <div className="text-xs opacity-70">Stay ahead of spikes.</div>
        </a>
      )}
      {/* 🎲 Mulligan Simulator (Red) */}
      <a href="/tools/mulligan" className="block rounded-xl border border-red-700/70 bg-neutral-950 p-4 hover:border-red-500 hover:shadow-[0_0_12px_rgba(239,68,68,0.35)] transition">
        <div className="font-semibold mb-1">🎲 Mulligan Simulator</div>
        <div className="text-xs opacity-70">Test your hands.</div>
      </a>
      {/* 🧮 Probability Helpers (Green) */}
      <a href="/tools/probability" className="block rounded-xl border border-green-700/70 bg-neutral-950 p-4 hover:border-green-500 hover:shadow-[0_0_12px_rgba(34,197,94,0.35)] transition">
        <div className="font-semibold mb-1">🧮 Probability Helpers</div>
        <div className="text-xs opacity-70">Odds of drawing X by turn Y.</div>
      </a>
    </div>
  );
}