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

  // HYDRATION FIX: Initialize to false on server, compute on client in useEffect
  // This prevents SSR/client mismatch since computeShow() accesses window/localStorage
  const [showWidgets, setShowWidgets] = React.useState<boolean>(false);
  const [remoteAllow, setRemoteAllow] = React.useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = React.useState<boolean>(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Compute actual value on client after hydration
    setShowWidgets(computeShow());
    
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

  // Click outside to close
  React.useEffect(() => {
    if (!isExpanded) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  if (remoteAllow === false) return null;
  if (!showWidgets) return null;

  return (
    <>
      {/* Collapsible Support button positioned on right side (opposite of feedback button) */}
      <div ref={containerRef} className="fixed bottom-4 right-4 z-[50]">
        {!isExpanded ? (
          /* Compact button */
          <button
            onClick={() => setIsExpanded(true)}
            className="rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white px-4 py-2 text-sm font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            title="Support ManaTap"
          >
            ❤️ Support us
          </button>
        ) : (
          /* Expanded panel */
          <div className="rounded-lg border border-neutral-800 bg-black/90 backdrop-blur p-3 shadow-2xl flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-neutral-300">Support ManaTap</span>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-neutral-400 hover:text-white transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Stripe support link */}
            <a
              href="https://buy.stripe.com/14A4gAdle89v3XE61q4AU01"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded bg-white text-black px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              💳 Support via Stripe
            </a>
            
            {/* Ko‑fi fallback link (no script) */}
            <a
              href="https://ko-fi.com/Q5Q11LZQCA"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded bg-[#72a4f2] text-black px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              ☕ Support us on Ko‑fi
            </a>
          </div>
        )}
      </div>
    </>
  );
}
