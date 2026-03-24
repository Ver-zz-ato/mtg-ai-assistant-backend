"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ChatDebugLogEntry, ChatProps } from "@/components/Chat";
import type { AdminPromptPreviewPayload } from "@/lib/ai/admin-prompt-preview-types";

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
  if (phase === "stream_complete") return `COMPLETE: content_length=${(d?.content_length as number) ?? "—"} duration_ms=${d?.stream_duration_ms ?? "—"}`;
  return `${e.tag} @ ${new Date(e.ts).toLocaleTimeString()}`;
}

/** Build one export payload: debug logs, last response, model, timings. */
function buildExportPayload(entries: ChatDebugLogEntry[]) {
  const startEntry = [...entries].reverse().find((e) => (e.data as Record<string, unknown>)?.phase === "start");
  const endEntry = [...entries].reverse().find((e) => (e.data as Record<string, unknown>)?.phase === "end");
  const completeEntry = [...entries].reverse().find((e) => (e.data as Record<string, unknown>)?.phase === "stream_complete");
  const startData = startEntry?.data as Record<string, unknown> | undefined;
  const endData = endEntry?.data as Record<string, unknown> | undefined;
  const completeData = completeEntry?.data as Record<string, unknown> | undefined;

  const model = startData?.model ?? null;
  const tier = startData?.tier ?? null;
  const decision = startData?.decision ?? (startData?.prompt_contract as { injected?: string })?.injected ?? null;
  const decisionReason = startData?.decision_reason ?? null;
  const commanderConfirmRequired = startData?.commander_confirm_required ?? null;
  const commanderConfirmed = startData?.commander_confirmed ?? null;
  const tokenLimit = startData?.tokenLimit ?? null;
  const promptPath = startData?.promptPath ?? null;
  const promptVersionId = startData?.promptVersionId ?? null;

  const streamStartTs = startEntry?.ts ?? null;
  const streamEndTs = endEntry?.ts ?? null;
  const streamDurationMs = (endData?.stream_duration_ms as number) ?? (completeData?.stream_duration_ms as number) ?? null;
  const lenFinal = endData?.lenFinal ?? null;
  const responseShapeGuess = endData?.response_shape_guess ?? null;
  const lastResponse = (completeData?.content as string) ?? null;
  const lastResponseLength = (completeData?.content_length as number) ?? (typeof lastResponse === "string" ? lastResponse.length : null);

  return {
    exportedAt: new Date().toISOString(),
    exportedAtUnixMs: Date.now(),
    summary: {
      model,
      tier,
      decision,
      decision_reason: decisionReason,
      commander_confirm_required: commanderConfirmRequired,
      commander_confirmed: commanderConfirmed,
      token_limit: tokenLimit,
      prompt_path: promptPath,
      prompt_version_id: promptVersionId,
      stream_start_ts: streamStartTs,
      stream_end_ts: streamEndTs,
      stream_duration_ms: streamDurationMs,
      len_final: lenFinal,
      response_shape_guess: responseShapeGuess,
      last_response_length: lastResponseLength,
    },
    lastResponse: lastResponse ?? undefined,
    debugLog: {
      entryCount: entries.length,
      entries,
    },
  };
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function PromptPreviewPanel({ preview }: { preview: AdminPromptPreviewPayload | null }) {
  const sec = (title: string, body: string | null | undefined, key: string) => {
    const t = typeof body === "string" ? body : "";
    return (
      <details key={key} className="border border-neutral-800 rounded p-2 open:bg-neutral-900/40">
        <summary className="cursor-pointer text-neutral-400 hover:text-neutral-300 flex flex-wrap items-center justify-between gap-2">
          <span>{title}</span>
          <span className="text-neutral-600 font-mono text-[10px]">{t.length} chars</span>
        </summary>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={() => copyText(t)}
          >
            Copy section
          </button>
        </div>
        <pre
          className={`mt-2 overflow-auto p-2 bg-neutral-950 rounded text-[11px] text-neutral-300 whitespace-pre-wrap break-words font-mono ${
            key === "final" ? "max-h-64" : "max-h-40"
          }`}
        >
          {t || "—"}
        </pre>
      </details>
    );
  };

  if (!preview) {
    return (
      <div className="flex flex-col h-full border-t border-neutral-800 pt-3 mt-2">
        <h3 className="text-sm font-medium text-neutral-300 mb-2">Prompt Preview</h3>
        <p className="text-xs text-neutral-600">
          Send a message as a logged-in admin to load the composed system prompt. (Guests do not receive prompt_preview.)
        </p>
      </div>
    );
  }

  const summaryLines = [
    `prompt_layers_used: ${preview.prompt_layers_used}`,
    `prompt_path: ${preview.prompt_path}`,
    `base_prompt_source: ${preview.base_prompt_source_label}`,
    `prompt_version_id: ${preview.prompt_version_id ?? "—"}`,
    `modules_attached: ${preview.modules_attached?.join(", ") || "—"}`,
    `selected_prompt_tier: ${preview.selected_prompt_tier}`,
    `model_tier (overlay): ${preview.model_tier}`,
    `stream_injected: ${preview.stream_injected}`,
    `tier_overlay_applied: ${preview.tier_overlay_applied}`,
    `final note: ${preview.final_system_prompt_note}`,
    ...(preview.notes || []),
  ].join("\n");

  const finalText = preview.final_system_prompt_exact || "";

  return (
    <div className="flex flex-col min-h-0 border-t border-neutral-800 pt-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-neutral-300">Prompt Preview</h3>
        <button
          type="button"
          className="px-2 py-1 rounded text-xs bg-neutral-700 hover:bg-neutral-600"
          onClick={() => copyText(finalText)}
        >
          Copy final prompt
        </button>
      </div>
      <p className="text-[10px] text-neutral-500 mb-2">
        Backend-sourced sections. <span className="text-emerald-600/90">Final prompt</span> is the exact{" "}
        <code className="text-neutral-400">system</code> string sent to the model for this request.
      </p>
      <div className="flex-1 overflow-auto space-y-2 pr-1 max-h-[50vh] lg:max-h-none">
        {sec("Summary", summaryLines, "sum")}
        {sec("Base prompt (core path)", preview.base_prompt_text, "base")}
        {sec("Standard: recent 2 turns", preview.standard_recent_history_text ?? null, "std")}
        {sec("User prefs (full tier)", preview.user_prefs_text ?? null, "prefs")}
        {sec("User level instruction", preview.user_level_text ?? null, "ulvl")}
        {sec("Tier overlay text", preview.tier_overlay_text ?? null, "tier")}
        {sec("Rules facts bundle", preview.rules_facts_text ?? null, "rules")}
        {sec("Deck intelligence (authoritative)", preview.deck_intelligence_block_text ?? null, "di")}
        {sec("V2 summary JSON path", preview.v2_summary_json_text ?? null, "v2j")}
        {sec("Semantic fingerprint", preview.semantic_fingerprint_text ?? null, "fp")}
        {sec("Recommendation steering", preview.recommendation_steering_text ?? null, "rw")}
        {sec("Cards-in-deck line", preview.cards_in_deck_line_text ?? null, "cid")}
        {sec("Recent conversation (v2 analyze)", preview.recent_conversation_block_text ?? null, "rc")}
        {sec("Commander grounding (authoritative)", preview.commander_grounding_text ?? null, "cmd")}
        {sec("Key cards grounding (authoritative)", preview.key_cards_grounding_text ?? null, "key")}
        {sec("DECK CONTEXT block", preview.deck_context_block_text ?? null, "dc")}
        {sec("Few-shot examples", preview.few_shot_examples_text ?? null, "fs")}
        {sec("Raw fallback extras (no v2)", preview.raw_fallback_extras_text ?? null, "raw")}
        {sec("Stream contract injection", preview.stream_contract_injection_text ?? null, "sci")}
        {sec("Thread memory summary", preview.thread_memory_block_text ?? null, "tm")}
        {sec("Pro cross-thread prefs", preview.pro_cross_thread_prefs_text ?? null, "pro")}
        {sec("Final system prompt (exact)", finalText, "final")}
      </div>
    </div>
  );
}

function DebugLogPanel({ entries, onExport }: { entries: ChatDebugLogEntry[]; onExport: () => void }) {
  return (
    <div className="flex flex-col min-h-0 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-neutral-300">Debug Log</h3>
        <button
          type="button"
          onClick={onExport}
          disabled={entries.length === 0}
          className="px-2 py-1 rounded text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export debug logs, last response, model, and timings as JSON"
        >
          Export all
        </button>
      </div>
      <div className="max-h-[40vh] lg:max-h-[35vh] overflow-auto font-mono text-xs bg-neutral-950 rounded border border-neutral-700 p-3 space-y-3">
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
  const [promptPreview, setPromptPreview] = useState<AdminPromptPreviewPayload | null>(null);
  const [forceTier, setForceTier] = useState<TierOption>("pro");

  const onDebugLog = useCallback((entry: ChatDebugLogEntry) => {
    setDebugEntries((prev) => [...prev, entry]);
    const d = entry.data as Record<string, unknown>;
    if (d?.phase === "start" && d?.prompt_preview && typeof d.prompt_preview === "object") {
      setPromptPreview(d.prompt_preview as AdminPromptPreviewPayload);
    }
  }, []);

  const exportAll = useCallback(() => {
    const payload = buildExportPayload(debugEntries);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-test-export-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [debugEntries]);

  const clearDebug = useCallback(() => {
    setDebugEntries([]);
    setPromptPreview(null);
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
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
            ← Admin
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
        <div className="min-h-[300px] lg:min-h-0 lg:max-h-[calc(100vh-10rem)] rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 flex flex-col gap-3 overflow-y-auto">
          <DebugLogPanel entries={debugEntries} onExport={exportAll} />
          <PromptPreviewPanel preview={promptPreview} />
        </div>
      </div>
    </div>
  );
}
