"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

type Shout = { id: number; user: string; text: string; ts: number };

export default function RightSidebar() {
  const [items, setItems] = useState<Shout[]>([]);
  const [name, setName] = useState<string>("Anon");
  const [text, setText] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [debugSpace, setDebugSpace] = useState<boolean>(false);
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

  // load history and connect SSE
  useEffect(() => {
    let closed = false;

    // PERFORMANCE: Defer shoutbox connection to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      (async () => {
        try {
          const r = await fetch("/api/shout/history", { cache: "no-store" });
          const j = await r.json().catch(() => ({ items: [] }));
          if (!closed) setItems((j.items as Shout[]) || []);
        } catch {}

        const ev = new EventSource("/api/shout/stream");
        evRef.current = ev;

        ev.onmessage = (e) => {
          try {
            const msg = JSON.parse((e as MessageEvent).data) as Shout;
            setItems((prev) => [...prev, msg].slice(-100));
          } catch {}
        };

        ev.onerror = () => { /* browser auto-reconnects */ };
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
    if (!clean) return;
    setText(""); // optimistic clear
    try {
      const res = await fetch("/api/shout/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, user: name || "Anon" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Post failed");
    } catch (e: any) {
      setToast(e?.message || "Post failed");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      post();
    }
  }

  return (
    <div className={`flex flex-col w-full relative z-0 text-[0px] leading-none [&>*]:m-0 [&>*]:p-0 [&_img]:block [&_img]:align-top [&_img]:m-0 [&_img]:p-0 ${debugSpace ? 'bg-yellow-900/5' : ''}`} style={{ gap: 0, margin: 0, padding: 0 }}>


      {/* Deck Snapshot: clickable link to /my-decks - full width like shoutbox */}
      <div className={`${debugSpace ? 'outline outline-2 outline-fuchsia-500 ' : ''}w-full relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-4`}>
        <a href="/my-decks" className="block rounded-xl overflow-hidden transition hover:scale-[1.02]">
          <img src="/Deck_Snapshot_Horizontal_cropped.png" alt="Deck Snapshot - View My Decks" className="w-full h-auto" />
        </a>
      </div>

      {/* Custom Card Creator promo panel with proper borders */}
      <div className={`relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-4 ${debugSpace ? 'outline outline-2 outline-sky-500' : ''}`}>
        {debugSpace && (
          <>
            {require('react').createElement('div', { key:'top', className:'absolute -top-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
            {require('react').createElement('div', { key:'bot', className:'absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
          </>
        )}
        {require('react').createElement(require('./CustomCardCreator').default, { compact: true })}
      </div>

      <div className="relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 min-h-[16rem] flex flex-col">
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
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 text-sm">
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
        <div className="mt-2 flex gap-2 items-center overflow-hidden">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-24 shrink-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
            placeholder="Anon"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Say something…"
          />
          <button
            onClick={post}
            className="px-3 py-2 shrink-0 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700"
          >
            Post
          </button>
        </div>
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
