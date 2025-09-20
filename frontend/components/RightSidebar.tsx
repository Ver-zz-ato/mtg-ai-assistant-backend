"use client";
import { useEffect, useRef, useState } from "react";

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
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="font-semibold mb-2">Deck Snapshot/Judger</div>
        <p className="text-xs opacity-70">
          Paste a deck into chat to get score, curve, color identity & quick fixes.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-64 flex flex-col">
        <div className="font-semibold mb-2">Shoutbox (live)</div>
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 text-sm">
          {items.map((t, idx) => (
            <div key={`${t.id}-${idx}`} className="bg-gray-800/60 rounded-lg px-3 py-2">
              <span className="text-yellow-300 mr-2">{t.user}:</span>
              <span className="text-gray-200">{t.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
            placeholder="Anon"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Say something…"
          />
          <button
            onClick={post}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700"
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

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
