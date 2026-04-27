"use client";
import React from "react";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";
import {
  costAuditClientLog,
  costAuditRequestId,
  isCostAuditClientEnabled,
} from "@/lib/observability/cost-audit";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  const [failedImgs, setFailedImgs] = React.useState<Set<number>>(new Set());
  const { user } = useAuth();
  const { isPro } = useProStatus();
  
  React.useEffect(()=>{ (async()=>{
    const session = isCostAuditClientEnabled() ? costAuditRequestId() : '';
    const t0 = Date.now();
    if (isCostAuditClientEnabled()) {
      costAuditClientLog({ event: 'client.config.fetch_start', component: 'TopToolsStrip', session, key: 'flags' });
    }
    try{
      const r=await fetch('/api/config?key=flags',{cache:'no-store'});
      const j=await r.json();
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: 'client.config.fetch_done',
          component: 'TopToolsStrip',
          session,
          durationMs: Date.now() - t0,
          ok: r.ok,
          status: r.status,
          hasFlags: !!j?.config?.flags,
        });
      }
      if(j?.config?.flags) setFlags(j.config.flags);
    } catch {
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: 'client.config.fetch_done',
          component: 'TopToolsStrip',
          session,
          durationMs: Date.now() - t0,
          ok: false,
          err: 'exception',
        });
      }
    }
  })(); },[]);
  // Price Tracker should always show (not behind risky_betas flag)
  // Only use risky_betas for truly experimental features
  const riskyOn = true; // Always show Price Tracker

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
    { href: "/collections/cost-to-finish", img: "/cost-to-finish.png", alt: "Cost to Finish", tour: "cost-to-finish" },
    { href: "/deck/swap-suggestions", img: "/budget-swaps.png", alt: "Budget Swaps", tour: "budget-swaps" },
    ...(riskyOn ? [{ href: "/price-tracker", img: "/price-tracker.png", alt: "Price Tracker", tour: "price-tracker" }] : []),
    { href: "/tools/mulligan", img: "/mulligan-simulator.png", alt: "Mulligan Simulator", tour: "mulligan" },
    { href: "/tools/probability", img: "/probability-helpers.png", alt: "Probability Helpers", tour: "probability" },
  ];

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-0 overflow-x-auto snap-x snap-mandatory scrollbar-hide opacity-85">
        {tools.map((tool, idx) => (
          <a
            key={idx}
            href={tool.href}
            onClick={() => handleToolClick(tool)}
            className="block rounded-xl overflow-hidden snap-center flex-shrink-0 lg:transition-[transform,box-shadow] lg:duration-200 lg:hover:scale-[1.02] lg:hover:shadow-xl lg:hover:shadow-blue-500/20 lg:hover:ring-2 lg:hover:ring-blue-400/50"
          >
            {failedImgs.has(idx) ? (
              <div className="w-full md:max-h-[170px] max-h-[102px] min-h-[102px] flex items-center justify-center bg-neutral-800 text-neutral-500 text-sm rounded-xl">
                {tool.alt}
              </div>
            ) : (
              <img
                src={tool.img}
                alt={tool.alt}
                className="w-full h-auto md:max-h-[170px] max-h-[102px] object-cover"
                loading={idx < 2 ? "eager" : "lazy"}
                decoding="async"
                onError={() => setFailedImgs((s) => new Set(s).add(idx))}
              />
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
