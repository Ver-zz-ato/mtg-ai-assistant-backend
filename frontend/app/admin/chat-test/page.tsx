"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ChatDebugLogEntry, ChatProps } from "@/components/Chat";

const Chat = dynamic(
  () => import("@/components/Chat").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
    <div className="flex items-center justify-center min-h-[400px] rounded-lg border border-neutral-700 bg-neutral-900/30 text-neutral-500">
      Loading Chat…
    </div>
  ),
  }
) as React.ComponentType<ChatProps>;

function debugSummary(e: ChatDebugLogEntry): string {
  const d = e.data as Record<string, unknown>;
  const phase = d?.phase as string | undefined;
  if (phase === "start") {
    const decision = d?.decision ?? (d?.prompt_contract as { injected?: string })?.injected ?? "—";
    const reason = d?.decision_reason ?? "—";
    const confirmReq = d?.commander_confirm_required === true ? " confirm_req" : "";
    const confirmed = d?.commander_confirmed === true ? " confirmed" : "";
    const tier = d?.tier ?? "—";
    const tokenLimit = d?.tokenLimit ?? "—";
    return `START: decision=${decision} reason=${reason}${confirmReq}${confirmed} tier=${tier} tokens=${tokenLimit}`;
  }
  if (phase === "end") {
    const lenFinal = d?.lenFinal ?? "—";
    const shape = d?.response_shape_guess ?? "—";
    const synRem = d?.cleanup_chars_removed_synergy ?? "";
    const truncRem = d?.cleanup_chars_removed_truncation ?? "";
    const trunc = d?.truncationRemoved ? " [trunc]" : "";
    const syn = d?.synergyRemoved ? " [synergy]" : "";
    return `END: lenFinal=${lenFinal} shape=${shape} removed_syn=${synRem} removed_trunc=${truncRem}${trunc}${syn}`;
  }
  return `${e.tag} @ ${new Date(e.ts).toLocaleTimeString()}`;
}

function DebugLogPanel({ entries, onExport }: { entries: ChatDebugLogEntry[]; onExport: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-neutral-300">Debug Log</h3>
        <button
          type="button"
          onClick={onExport}
          disabled={entries.length === 0}
          className="px-2 py-1 rounded text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export
        </button>
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs bg-neutral-950 rounded border border-neutral-700 p-3 space-y-3">
        {entries.length === 0 ? (
          <p className="text-neutral-600">Send a message to see AI debug (promptPath, model, tier, token cap, commander state, cleanup).</p>
        ) : (
          entries.map((e, i) => (
            <details key={i} className="border border-neutral-800 rounded p-2">
              <summary className="cursor-pointer text-neutral-400 hover:text-neutral-300">
                {debugSummary(e)} — {new Date(e.ts).toLocaleTimeString()}
              </summary>
              <pre className="mt-2 p-2 bg-neutral-900 rounded text-[11px] overflow-x-auto whitespace-pre-wrap break-words text-neutral-300">
                {JSON.stringify(e.data, null, 2)}
              </pre>
            </details>
          ))
        )}
      </div>
    </div>
  );
}

type TierOption = "guest" | "free" | "pro";

export default function AdminChatTestPage() {
  const [debugEntries, setDebugEntries] = useState<ChatDebugLogEntry[]>([]);
  const [forceTier, setForceTier] = useState<TierOption>("pro");

  const onDebugLog = useCallback((entry: ChatDebugLogEntry) => {
    setDebugEntries((prev) => [...prev, entry]);
  }, []);

  const exportDebug = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      entries: debugEntries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-debug-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [debugEntries]);

  const clearDebug = useCallback(() => {
    setDebugEntries([]);
  }, []);

  return (
    <div className="max-w-[1920px] mx-auto p-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Chat Test (isolated)</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Full chat module with debug logging. Debug panel shows ActiveDeckContext, prompt contract, deck resolution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearDebug}
            disabled={debugEntries.length === 0}
            className="px-3 py-1.5 rounded text-sm bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Log
          </button>
          <Link href="/admin/ai" className="text-sm text-neutral-400 hover:text-white">
            ← AI Admin
          </Link>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-2 min-h-[400px] rounded-lg border border-neutral-700 bg-neutral-900/30 overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-neutral-700 bg-neutral-900/50">
            <span className="text-xs font-medium text-neutral-400">Tier (for testing):</span>
            {(["guest", "free", "pro"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setForceTier(tier)}
                className={`px-3 py-1.5 rounded text-sm font-medium capitalize ${forceTier === tier ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200"}`}
              >
                {tier}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-2">
            <Chat debugMode={true} onDebugLog={onDebugLog} forceTier={forceTier} />
          </div>
        </div>
        <div className="min-h-[300px] lg:min-h-0 rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 flex flex-col">
          <DebugLogPanel entries={debugEntries} onExport={exportDebug} />
        </div>
      </div>
    </div>
  );
}
