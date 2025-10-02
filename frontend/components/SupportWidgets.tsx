"use client";
import React from "react";
import Script from "next/script";

/**
 * Support widgets (Stripe, Ko‑fi). We only enable these in production to avoid
 * any chance of third‑party overlays breaking the local dev experience.
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

  React.useEffect(() => {
    if (!showWidgets) return;

    const schedule = (fn: () => void) => {
      try { (window as any).requestIdleCallback?.(fn, { timeout: 3000 }); }
      catch { setTimeout(fn, 1500); }
    };

    // Ko-fi inline button (uses their widget v2 script) — schedule on idle to reduce jank
    schedule(() => {
      const w2 = document.createElement('script');
      w2.src = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
      w2.async = true;
      w2.onload = () => {
        try {
          // @ts-ignore
          window.kofiwidget2?.init?.('Support me on Ko-fi', '#72a4f2', 'Q5Q11LZQCA');
          // @ts-ignore
          window.kofiwidget2?.draw?.();
        } catch {}
      };
      document.body.appendChild(w2);
    });

    // NOTE: Ko-fi floating overlay disabled to avoid white full-screen overlays. Inline button only.
  }, [showWidgets]);

  if (remoteAllow === false) return null;
  if (!showWidgets) return null;

  return (
    <>
      {/* Bottom-right dock with Stripe and Ko-fi */}
      <div className="fixed bottom-4 right-4 z-[40] flex flex-col items-end gap-2 pointer-events-none">
        <div className="rounded border border-neutral-800 bg-black/70 backdrop-blur p-2 pointer-events-auto">
          {/* Stripe support link */}
          <a
            href="https://buy.stripe.com/14A4gAdle89v3XE61q4AU01"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded bg-white text-black px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Support via Stripe
          </a>
        </div>
        {/* Ko-fi widget v2 will render its button automatically */}
      </div>
    </>
  );
}
