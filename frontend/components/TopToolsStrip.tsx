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
import { CHAT_ROUTE } from "@/lib/navigation/chatRoute";

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
    if (tour === 'deck-checker') return 'deck-checker';
    if (tour === 'budget-swaps') return 'budget-swaps';
    if (tour === 'price-tracker') return 'price-tracker';
    if (tour === 'mulligan') return 'mulligan';
    if (tour === 'build-a-deck') return 'build-a-deck';
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
    { href: "/mtg-deck-checker", img: "/tool-deck-checker.png", alt: "Deck Checker", tour: "deck-checker" },
    { href: "/deck/swap-suggestions", img: "/tool-budget-swaps.png", alt: "Budget Swaps", tour: "budget-swaps" },
    ...(riskyOn ? [{ href: "/price-tracker", img: "/tool-price-tracker.png", alt: "Price Tracker", tour: "price-tracker" }] : []),
    { href: "/tools/mulligan", img: "/tool-mulligan-lab.png", alt: "Mulligan Lab", tour: "mulligan" },
    { href: "/build-a-deck", img: "/tool-build-a-deck.png", alt: "Build a Deck", tour: "build-a-deck" },
    { href: CHAT_ROUTE, img: "/tool-ai-chat.png", alt: "AI Chat", tour: "ai-chat" },
  ];

  return (
    <div className="w-full">
      <div className="w-full flex md:grid md:grid-cols-6 items-start gap-px mb-0 overflow-x-auto md:overflow-hidden scrollbar-hide opacity-95">
        {tools.map((tool, idx) => (
          <a
            key={idx}
            href={tool.href}
            onClick={() => handleToolClick(tool)}
            className="block w-[142px] min-w-[142px] sm:w-[160px] sm:min-w-[160px] md:w-full md:min-w-0 aspect-[1250/320] rounded-xl overflow-hidden outline-none focus:outline-none focus-visible:outline-none"
          >
            {failedImgs.has(idx) ? (
              <div className="w-full aspect-[1250/320] flex items-center justify-center bg-neutral-800 text-neutral-500 text-sm rounded-xl">
                {tool.alt}
              </div>
            ) : (
              <img
                src={tool.img}
                alt={tool.alt}
                width={1250}
                height={320}
                className="block w-full h-full object-cover"
                loading="eager"
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
