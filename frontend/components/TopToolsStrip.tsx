"use client";
import React from "react";
import Image from "next/image";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  const { user } = useAuth();
  const { isPro } = useProStatus();
  
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  // Map href to tool identifier
  const getToolId = (href: string, tour: string): string => {
    if (tour === 'cost-to-finish') return 'cost-to-finish';
    if (tour === 'budget-swaps') return 'budget-swaps';
    if (tour === 'price-tracker') return 'price-tracker';
    if (tour === 'mulligan') return 'mulligan';
    if (tour === 'probability') return 'probability';
    return tour;
  };

  const handleToolClick = async (tool: { href: string; tour: string }) => {
    const toolId = getToolId(tool.href, tool.tour);
    track('ui_click', {
      area: 'top-tools',
      action: 'open_tool',
      tool: toolId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
  };

  const tools = [
    { href: "/collections/cost-to-finish", img: "/Cost To Finish.png", alt: "Cost to Finish", tour: "cost-to-finish" },
    { href: "/deck/swap-suggestions", img: "/Budget Swaps.png", alt: "Budget Swaps", tour: "budget-swaps" },
    ...(riskyOn ? [{ href: "/price-tracker", img: "/Price Tracker.png", alt: "Price Tracker", tour: "price-tracker" }] : []),
    { href: "/tools/mulligan", img: "/Mulligan Simulator.png", alt: "Mulligan Simulator", tour: "mulligan" },
    { href: "/tools/probability", img: "/Probability Helpers.png", alt: "Probability Helpers", tour: "probability" },
  ];

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-0 overflow-x-auto snap-x snap-mandatory scrollbar-hide">
        {tools.map((tool, idx) => (
          <a
            key={idx}
            href={tool.href}
            onClick={() => handleToolClick(tool)}
            className="block rounded-xl overflow-hidden snap-center flex-shrink-0"
          >
            <Image src={tool.img} alt={tool.alt} width={400} height={200} className="w-full h-auto md:max-h-[200px] max-h-[120px] object-cover" priority />
          </a>
        ))}
      </div>
    </div>
  );
}
