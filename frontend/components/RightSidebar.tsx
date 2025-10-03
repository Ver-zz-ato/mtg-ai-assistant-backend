"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

type Shout = { id: number; user: string; text: string; ts: number };

export default function RightSidebar() {
  const [items, setItems] = useState<Shout[]>([]);
  const [name, setName] = useState<string>("Anon");
  const [text, setText] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const evRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll when new items arrive
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items.length]);

  // load history and connect SSE
  useEffect(() => {
    let closed = false;

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

    return () => {
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
    <div className="flex flex-col gap-4 w-full relative z-0">
      {/* Deck Snapshot: allow custom horizontal badge/component override */}
      {(() => {
        try {
          const Custom = (require as any)("@/badges/DeckSnapshotHorizontal")?.default
            || (require as any)("@/badges/Deck-Snapshot-Horizontal")?.default
            || (require as any)("@/badges/Deck_Snapshot_Horizontal")?.default;
          if (Custom) return (require('react').createElement(Custom));
        } catch {}
        return (
          <div className="rounded-xl border border-violet-700/60 bg-neutral-950 p-4 shadow-[0_0_12px_rgba(124,58,237,0.25)]">
            <div className="font-semibold mb-1">🧪 Deck Snapshot/Judger</div>
            <p className="text-xs opacity-80">
              Curve, color, and quick fixes from your current list.
            </p>
          </div>
        );
      })()}

      {/* Custom Card Creator promo panel */}
      <div className="relative z-20">
        {require('react').createElement(require('./CustomCardCreator').default)}
      </div>

      <div className="relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 min-h-[16rem] flex flex-col">
        <div className="font-semibold mb-2">Shoutbox (live)</div>
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

      <div className="relative z-0 bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
