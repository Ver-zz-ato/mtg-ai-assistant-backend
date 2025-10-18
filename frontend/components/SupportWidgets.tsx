"use client";
import React from "react";

/**
 * Support widgets (Stripe, Ko‑fi). The Ko‑fi script was causing a full‑screen
 * white overlay on some environments. We now avoid loading their widget and use
 * a simple outbound link instead.
 */
export default function SupportWidgets() {
  function computeShow(): boolean {
    if (typeof window === 'undefined') return false;
    // Hard-off on localhost for development stability
    try {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return false;
    } catch { return false; }

    try {
      // 1) Session override from query param (?widgets=off|on)
      const params = new URLSearchParams(window.location.search);
      const qp = (params.get('widgets') || '').toLowerCase();
      if (qp === 'off' || qp === 'on') {
        sessionStorage.setItem('ui:widgets:force', qp);
      }
    } catch {}
    try {
      const force = (sessionStorage.getItem('ui:widgets:force') || '').toLowerCase();
      if (force === 'off') return false;
      if (force === 'on') return true;
    } catch {}
    try {
      const userPref = window.localStorage.getItem('ui:showWidgets');
      if (userPref === '0') return false;
      if (userPref === '1') return true;
    } catch {}
    // Fallback: enable elsewhere
    return true;
  }

  const [showWidgets, setShowWidgets] = React.useState<boolean>(() => computeShow());
  const [remoteAllow, setRemoteAllow] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // fetch flags to respect global widgets kill switch
    (async () => {
      try { const r = await fetch('/api/config?key=flags', { cache: 'no-store' }); const j = await r.json(); const fl = j?.config?.flags; if (fl && typeof fl.widgets === 'boolean') setRemoteAllow(!!fl.widgets); else setRemoteAllow(true); } catch { setRemoteAllow(true); }
    })();
  }, []);

  React.useEffect(() => {
    const onChanged = () => setShowWidgets(computeShow());
    window.addEventListener('ui:widgets:changed', onChanged);
    // Recompute on visibility/nav changes
    window.addEventListener('popstate', onChanged);
    window.addEventListener('hashchange', onChanged);
    return () => {
      window.removeEventListener('ui:widgets:changed', onChanged);
      window.removeEventListener('popstate', onChanged);
      window.removeEventListener('hashchange', onChanged);
    };
  }, []);

  // Cleanup: if a previous version injected Ko‑fi iframes/overlays, remove them.
  React.useEffect(() => {
    try {
      const nodes = document.querySelectorAll('iframe[src*="ko-fi.com"], [id*="kofi"], [class*="kofi"]');
      nodes.forEach((n) => {
        // Be conservative: only strip obvious overlay containers/iframes
        if (n instanceof HTMLIFrameElement || n instanceof HTMLDivElement) {
          // Avoid removing our own content by checking for Ko‑fi specific hints
          const isKofi = (n as HTMLElement).id?.toLowerCase?.().includes('kofi') ||
                         (n as HTMLElement).className?.toLowerCase?.().includes('kofi') ||
                         (n instanceof HTMLIFrameElement && /ko-fi\.com/.test(n.src));
          if (isKofi) {
            try { n.remove(); } catch {}
          }
        }
      });
    } catch {}
  }, []);

  if (remoteAllow === false) return null;
  if (!showWidgets) return null;

  return (
    <>
      {/* Bottom-left dock with Stripe and Ko‑fi link, positioned above feedback button */}
      <div className="fixed bottom-24 left-4 z-[60] flex flex-col items-start gap-2 pointer-events-none">
        <div className="rounded border border-neutral-800 bg-black/70 backdrop-blur p-2 pointer-events-auto flex flex-col gap-2 shadow-lg">
          {/* Stripe support link */}
          <a
            href="https://buy.stripe.com/14A4gAdle89v3XE61q4AU01"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded bg-white text-black px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Support via Stripe
          </a>
          {/* Ko‑fi fallback link (no script) */}
          <a
            href="https://ko-fi.com/Q5Q11LZQCA"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded bg-[#72a4f2] text-black px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Support me on Ko‑fi
          </a>
        </div>
      </div>
    </>
  );
}
