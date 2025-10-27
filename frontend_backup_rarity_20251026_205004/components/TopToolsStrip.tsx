"use client";
import React from "react";
import Image from "next/image";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  const tools = [
    { href: "/collections/cost-to-finish", img: "/Cost To Finish.png", alt: "Cost to Finish", tour: "cost-to-finish" },
    { href: "/deck/swap-suggestions", img: "/Budget Swaps.png", alt: "Budget Swaps", tour: "budget-swaps" },
    ...(riskyOn ? [{ href: "/price-tracker", img: "/Price Tracker.png", alt: "Price Tracker", tour: "price-tracker" }] : []),
    { href: "/tools/mulligan", img: "/Mulligan Simulator.png", alt: "Mulligan Simulator", tour: "mulligan" },
    { href: "/tools/probability", img: "/Probability Helpers.png", alt: "Probability Helpers", tour: "probability" },
  ];

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-0 overflow-x-auto md:overflow-visible">
        {tools.map((tool, idx) => (
          <a
            key={idx}
            href={tool.href}
            className="block rounded-xl overflow-hidden"
            data-tour={tool.tour}
          >
            <Image src={tool.img} alt={tool.alt} width={400} height={200} className="w-full h-auto" priority />
          </a>
        ))}
      </div>
    </div>
  );
}
