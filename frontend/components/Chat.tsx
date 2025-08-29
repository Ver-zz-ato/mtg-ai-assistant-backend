"use client";
import { useState } from "react";
import DeckHealthCard from "./DeckHealthCard";

export default function Chat() {
  const [messages] = useState([
    { role: "user", content: "Analyze this Yuriko deck and suggest 3 cheap upgrades." },
    { role: "assistant", content: "Got it! Quick scan:\n• Mana curve leans low; card draw a bit thin.\n• Blue interaction is solid; consider 1–2 cheap ninjutsu enablers." },
  ]);

  return (
    <>
      <div className="flex-1 bg-gray-900/60 rounded-xl border border-gray-800 p-4 overflow-y-auto min-h-[60vh]">
        {messages.map((m, i) => (
          <div key={i} className="mb-4">
            <div className={m.role === "user" ? "inline-block bg-gray-800 rounded-xl px-4 py-3" : "bg-gray-900 border border-gray-800 rounded-xl p-4 whitespace-pre-wrap"}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Example special card */}
        <div className="mb-4">
          <DeckHealthCard />
        </div>

        <div className="mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm">
            <p className="font-medium mb-1">Rules check:</p>
            <p className="text-gray-300">You can ninjutsu after blockers are declared but before damage. See CR 702.49a.</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-3 min-h-[56px] focus:outline-none focus:ring-1 focus:ring-yellow-500" placeholder="Message MTG Coach…"/>
        <button className="h-[56px] px-5 rounded-xl bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400">Send</button>
      </div>
    </>
  );
}
