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
      className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-center text-sm font-semibold text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
      title="Recalculate snapshot prices and refresh the page"
    >
      Recalculate prices
    </button>
  );
}
