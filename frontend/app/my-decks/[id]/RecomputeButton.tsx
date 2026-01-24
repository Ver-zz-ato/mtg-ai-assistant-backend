"use client";

import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

export default function RecomputeButton() {
  const { user } = useAuth();
  const { isPro } = useProStatus();
  
  return (
    <button
      onClick={async () => {
        // Track UI click
        track('ui_click', {
          area: 'functions',
          action: 'run',
          fn: 'cost-to-finish',
        }, {
          userId: user?.id || null,
          isPro: isPro,
        });
        
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('r', String(Date.now()));
          window.location.href = url.toString();
        } catch {
          // noop
        }
      }}
      className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium text-neutral-300"
      title="Recalculate snapshot prices and refresh the page"
    >
      Recalculate prices
    </button>
  );
}