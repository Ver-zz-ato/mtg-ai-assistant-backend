"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SCROLL_THRESHOLD = 300;

type Props = {
  commanderSlug: string;
  commanderName: string;
};

export function CommanderActionBar({ commanderSlug, commanderName }: Props) {
  const [visible, setVisible] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_THRESHOLD);
    onScroll(); // initial
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const browseUrl = `/decks/browse?search=${encodeURIComponent(commanderName)}`;
  const mulliganUrl = `/tools/mulligan?commander=${encodeURIComponent(commanderSlug)}`;
  const costUrl = `/collections/cost-to-finish?commander=${encodeURIComponent(commanderSlug)}`;
  const swapsUrl = `/deck/swap-suggestions?commander=${encodeURIComponent(commanderSlug)}`;

  const actions = [
    { href: browseUrl, label: "Browse decks" },
    { href: mulliganUrl, label: "Mulligan simulator" },
    { href: costUrl, label: "Cost to Finish" },
    { href: swapsUrl, label: "Budget swaps" },
  ];

  if (!visible) return null;

  return (
    <>
      {/* Desktop: slim horizontal toolbar at top when scrolled */}
      <div className="hidden md:flex fixed top-0 left-0 right-0 z-40 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <span className="text-xs text-neutral-500 mr-2 shrink-0">Quick actions:</span>
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-cyan-400 hover:bg-neutral-800 hover:text-cyan-300 transition-colors"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile: collapsible floating bar */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-40">
        {mobileExpanded ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/95 backdrop-blur p-3 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-400">Quick actions</span>
              <button
                type="button"
                onClick={() => setMobileExpanded(false)}
                className="text-neutral-500 hover:text-white p-1"
                aria-label="Collapse"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-cyan-400 bg-neutral-800/80 hover:bg-neutral-700 text-center"
                  onClick={() => setMobileExpanded(false)}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMobileExpanded(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-neutral-700 bg-neutral-900/95 backdrop-blur text-sm font-medium text-cyan-400 hover:bg-neutral-800 shadow-lg flex items-center justify-center gap-2"
          >
            <span>Quick actions</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
