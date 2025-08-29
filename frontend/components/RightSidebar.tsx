// frontend/components/RightSidebar.tsx
"use client";
import { useState } from "react";

export default function RightSidebar() {
  const [items, setItems] = useState<string[]>([
    "PlayerX: Uploaded Yuriko deck 🔥",
    "Kaya: Any cheap counters for dragons?",
  ]);
  const [text, setText] = useState("");

  const post = () => {
    const v = text.trim();
    if (!v) return;
    setItems((s) => [...s, v]);
    setText("");
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="font-semibold mb-2">Deck Snapshot/Judger</div>
        <div className="text-sm text-gray-300">
          Paste a deck into chat to get score, curve, color identity & quick fixes.
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-64 flex flex-col">
        <div className="font-semibold mb-2">Shoutbox</div>
        <div className="flex-1 overflow-y-auto space-y-2 text-sm">
          {items.map((t, i) => (
            <div key={i} className="bg-gray-800/60 rounded-lg px-3 py-2">{t}</div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
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
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
"use client";
import { useEffect, useRef, useState } from "react";

type Shout = { id: number; user: string; text: string; ts: number };

export default function RightSidebar() {
  const [items, setItems] = useState<Shout[]>([]);
  const [name, setName] = useState<string>("Anon");
  const [text, setText] = useState<string>("");
  const evRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // auto scroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items.length]);

  // load history + connect live stream
  useEffect(() => {
    let closed = false;

    (async () => {
      try {
        const r = await fetch("/api/shout/history");
        const j = await r.json();
        if (!closed) setItems(j.items as Shout[]);
      } catch {}

      const ev = new EventSource("/api/shout/stream");
      evRef.current = ev;

      ev.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as Shout;
          setItems((prev) => [...prev, msg]);
        } catch {}
      };

      ev.onerror = () => {
        // auto-reconnect handled by EventSource; nothing else to do
      };
    })();

    return () => {
      closed = true;
      evRef.current?.close();
    };
  }, []);

  async function post() {
    const clean = text.trim();
    if (!clean) return;
    setText("");
    try {
      await fetch("/api/shout/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, user: name || "Anon" }),
      });
    } catch {
      // no-op; server will broadcast if it succeeded
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
        <div className="text-sm text-gray-300">
          Paste a deck into chat to get score, curve, color identity & quick fixes.
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-64 flex flex-col">
        <div className="font-semibold mb-2">Shoutbox (live)</div>
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 text-sm">
          {items.map((t) => (
            <div key={t.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
              <span className="text-yellow-300 mr-2">{t.user}:</span>
              <span className="text-gray-200">{t.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Name"
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
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
