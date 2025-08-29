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
