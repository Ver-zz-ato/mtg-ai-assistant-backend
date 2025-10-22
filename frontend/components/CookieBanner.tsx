"use client";
import React from "react";
import Link from "next/link";

/**
 * Tiny cookie/consent banner.
 * - Stores analytics consent in localStorage key: 'analytics:consent' = 'granted'
 * - Emits a window event 'analytics:consent-granted' when accepted so analytics can initialize
 */
export default function CookieBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      const granted = window.localStorage.getItem('analytics:consent') === 'granted';
      setVisible(!granted);
    } catch {
      setVisible(true);
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem('analytics:consent', 'granted');
      console.log('✅ Cookie consent saved to localStorage');
    } catch (e) {
      console.error('Failed to save cookie consent:', e);
    }
    try {
      window.dispatchEvent(new Event('analytics:consent-granted'));
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]">
      <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-black/80 backdrop-blur px-3 py-2 text-xs text-neutral-200 shadow-lg">
        <span>
          This site uses cookies for analytics and login. By continuing, you accept this.
        </span>
        <button
          onClick={accept}
          className="shrink-0 rounded-md bg-white text-black px-2 py-1 text-xs font-medium hover:opacity-90"
        >
          Accept
        </button>
        <Link href="/privacy" className="underline opacity-80 hover:opacity-100 whitespace-nowrap">
          Learn more
        </Link>
      </div>
    </div>
  );
}