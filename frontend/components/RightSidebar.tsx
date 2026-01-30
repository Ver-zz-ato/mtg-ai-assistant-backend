"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import BadgeProgressWidget from "./BadgeProgressWidget";
import DeckAnalyzerExpandable from "./DeckAnalyzerExpandable";
import HomepageFAQ from "./HomepageFAQ";

type Shout = { id: number; user: string; text: string; ts: number };

export default function RightSidebar() {
  const [items, setItems] = useState<Shout[]>([]);
  const [name, setName] = useState<string>("Anon");
  const [text, setText] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [posting, setPosting] = useState<boolean>(false);
  const [debugSpace, setDebugSpace] = useState<boolean>(false);
  const [isCardPanelCollapsed, setIsCardPanelCollapsed] = useState<boolean>(false);
  const evRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll when new items arrive
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items.length]);

  // capture ?dbg=space for spacing debug
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search);
        if ((q.get('dbg') || '').toLowerCase() === 'space') setDebugSpace(true);
      }
    } catch {}
  }, []);

  // Load collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('custom_card_panel_collapsed');
      if (stored === 'true') {
        setIsCardPanelCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleCardPanel = () => {
    const newState = !isCardPanelCollapsed;
    setIsCardPanelCollapsed(newState);
    try {
      localStorage.setItem('custom_card_panel_collapsed', String(newState));
    } catch {}
  };

  // load history and connect SSE
  useEffect(() => {
    let closed = false;

    // PERFORMANCE: Defer shoutbox connection to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      (async () => {
        try {
          const r = await fetch("/api/shout/history", { cache: "no-store" });
          const j = await r.json().catch(() => ({ items: [] }));
          if (!closed) {
            const items = (j.items as Shout[]) || [];
            // Ensure items are sorted by timestamp descending (newest first)
            setItems(items.sort((a, b) => b.ts - a.ts));
          }
        } catch {}

        const { createSecureEventSource, logConnectionError } = await import('@/lib/secure-connections');
        const ev = createSecureEventSource("/api/shout/stream");
        evRef.current = ev;

        ev.onmessage = (e) => {
          try {
            const msg = JSON.parse((e as MessageEvent).data) as Shout;
            setItems((prev) => {
              const updated = [...prev, msg];
              // Sort by timestamp descending (newest first) and keep last 100
              return updated.sort((a, b) => b.ts - a.ts).slice(0, 100);
            });
          } catch {}
        };

        ev.onerror = (event) => {
          // Log connection errors for debugging (EventSource onerror receives an Event, not Error)
          // Only log if connection actually failed (readyState === 2 = CLOSED)
          if (ev.readyState === EventSource.CLOSED) {
            logConnectionError('EventSource connection closed', {
              type: 'eventsource',
              url: '/api/shout/stream',
              readyState: ev.readyState,
            });
          }
          // Browser auto-reconnects, but we log for debugging when fully closed
        };
      })();
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      closed = true;
      evRef.current?.close();
      evRef.current = null;
    };
  }, []);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function post() {
    const clean = text.trim();
    if (!clean || posting) return;
    
    const originalText = text;
    const originalName = name;
    
    setPosting(true);
    setText(""); // optimistic clear
    
    try {
      const res = await fetch("/api/shout/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, user: originalName || "Anon" }),
      });
      
      const j = await res.json().catch(() => ({}));
      
      if (!res.ok || j?.ok === false) {
        // Restore text on error
        setText(originalText);
        throw new Error(j?.error || "Post failed");
      }
      
      // Success - message will appear via SSE stream
      // Clear any existing toast
      setToast(null);
    } catch (e: any) {
      // Restore text on error
      setText(originalText);
      const errorMsg = e?.message || "Post failed. Please try again.";
      setToast(errorMsg);
      console.error("Shoutbox post error:", e);
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      post();
    }
  }

  return (
    <div className={`flex flex-col w-full gap-4 relative z-0 ${debugSpace ? 'bg-yellow-900/5' : ''}`}>
      {/* FAQ Section - collapsed by default */}
      <div className="w-full">
        <HomepageFAQ defaultCollapsed={true} />
      </div>

      {/* Deck Snapshot: Expandable analyzer panel */}
      <div className={`${debugSpace ? 'outline outline-2 outline-fuchsia-500 ' : ''}w-full relative z-20`}>
        <DeckAnalyzerExpandable />
      </div>

      {/* Custom Card Creator promo panel - lighter, playful styling */}
      <div className={`relative z-20 bg-neutral-900/40 border border-neutral-700/50 rounded-xl overflow-hidden transition-all duration-300 ${debugSpace ? 'outline outline-2 outline-sky-500' : ''}`}>
        <button
          onClick={toggleCardPanel}
          className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 transition-colors"
        >
          <h3 className="text-sm font-medium text-neutral-300 opacity-80">🎨 Custom Card Creator</h3>
          <svg
            className={`w-5 h-5 text-neutral-400 transition-transform duration-300 ${isCardPanelCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className={`transition-all duration-300 overflow-hidden ${isCardPanelCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}>
          <div className="p-4 pt-0">
            {debugSpace && (
              <>
                {require('react').createElement('div', { key:'top', className:'absolute -top-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
                {require('react').createElement('div', { key:'bot', className:'absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
              </>
            )}
            {require('react').createElement(require('./CustomCardCreator').default, { compact: true })}
          </div>
        </div>
      </div>

      {/* Achievement Progress Widget - moved from left sidebar */}
      <div>
        <BadgeProgressWidget />
      </div>

      <div className="relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:min-h-[16rem] flex flex-col max-h-[50vh] md:max-h-none">
        <div className="flex flex-col items-center gap-1.5 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 bg-clip-text text-transparent">
              Shoutbox
            </h2>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
          </div>
          <div className="h-0.5 w-24 bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 rounded-full animate-pulse"></div>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 text-sm min-h-0">
          {items.map((t, idx) => (
            <div key={`${t.id}-${idx}`} className="relative max-w-[92%]">
              <div className="bg-emerald-950/40 border border-emerald-700 text-emerald-100 rounded-lg px-3 py-2">
                <span className="text-emerald-300 mr-2">{t.user}:</span>
                <span>{t.text}</span>
              </div>
              <div className="absolute left-2 -bottom-1 w-0 h-0 border-t-8 border-t-emerald-700 border-l-8 border-l-transparent"></div>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); post(); }} className="mt-2 flex gap-2 items-center overflow-hidden">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-24 shrink-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
            placeholder="Anon"
          />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Say something…"
          />
          <button
            type="submit"
            onClick={(e) => { e.preventDefault(); post(); }}
            disabled={posting || !text.trim()}
            className="px-3 py-2 shrink-0 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </form>
        {toast && (
          <div className="mt-2 text-xs text-red-300" aria-live="polite">
            {toast}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-red-600/95 text-white text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

    </div>
  );
}
