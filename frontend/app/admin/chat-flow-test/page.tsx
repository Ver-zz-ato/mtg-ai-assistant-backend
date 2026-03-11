"use client";

import React, { useState } from "react";
import Link from "next/link";
import { renderMarkdown } from "@/lib/chat/markdownRenderer";

type Tier = "guest" | "free" | "pro";

type Metadata = {
  tierOverride: Tier;
  modelTier: string;
  modelTierLabel: string;
  effectiveModel: string;
  promptTier: string;
  promptTierReason: string;
  promptPath: string;
  formatKey: string;
  modulesAttached: string[];
  systemPromptTokenEstimate: number;
  v2SummaryUsed: boolean;
  v2SummaryTokens: number | null;
  deckContextSource: string;
  deckCommander: string | null;
  deckCardCount: number | null;
  deckFactsPresent: boolean;
  synergyDiagnosticsPresent: boolean;
  messageCount: number;
  openaiElapsedMs: number;
  openaiOk: boolean;
  openaiError?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  accuracyChecks: { cardNamesBracketed: boolean; noRawCardDump: boolean; reasonableLength: boolean };
  systemPromptPreview?: string;
};

function parseMessagesJson(json: string): Array<{ role: string; content: string }> | undefined {
  const s = json?.trim();
  if (!s) return undefined;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return undefined;
    return arr
      .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: String(m.content) }));
  } catch {
    return undefined;
  }
}

export default function ChatFlowTestPage() {
  const [tier, setTier] = useState<Tier>("free");
  const [text, setText] = useState("");
  const [decklist, setDecklist] = useState("");
  const [messagesJson, setMessagesJson] = useState("");
  const [response, setResponse] = useState("");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runTest() {
    setBusy(true);
    setError(null);
    setResponse("");
    setMetadata(null);
    try {
      const r = await fetch("/api/admin/chat-flow-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || "hi",
          tier,
          messages: parseMessagesJson(messagesJson),
          decklist: decklist || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setResponse(j.response ?? "");
      setMetadata(j.metadata ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function exportResult() {
    const payload = { response, metadata, error: error ?? undefined, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-flow-test-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat Flow Test</h1>
        <Link href="/admin/ai" className="text-sm text-neutral-400 hover:text-white">
          ← AI Admin
        </Link>
      </div>
      <p className="text-sm text-neutral-400">
        Test the AI chat flow with different tiers. See model, prompt path, deck context, and accuracy checks.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Input */}
        <div className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2"
            >
              <option value="guest">Guest (gpt-4o-mini)</option>
              <option value="free">Free (gpt-4o)</option>
              <option value="pro">Pro (gpt-5.1)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Message</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask something or paste a decklist..."
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <details className="group">
            <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300 list-none">
              Previous messages (optional) — JSON for multi-turn / memory
            </summary>
            <textarea
              value={messagesJson}
              onChange={(e) => setMessagesJson(e.target.value)}
              placeholder='[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]'
              rows={3}
              className="mt-1 w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-xs font-mono"
            />
          </details>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              Decklist (optional) — paste to test deck context
            </label>
            <textarea
              value={decklist}
              onChange={(e) => setDecklist(e.target.value)}
              placeholder="1 Sol Ring&#10;1 Command Tower..."
              rows={4}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            onClick={runTest}
            disabled={busy}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium"
          >
            {busy ? "Running…" : "Run Test"}
          </button>
        </div>

        {/* Right: Output + Log */}
        <div className="space-y-3">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">
              {error}
            </div>
          )}
          {response && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
              <div className="text-xs text-neutral-500 mb-2">Response</div>
              <div className="text-sm prose prose-invert max-w-none prose-p:my-1 prose-ul:my-1">
                {renderMarkdown(response)}
              </div>
            </div>
          )}
          {metadata && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 overflow-x-auto">
              <div className="text-xs text-neutral-500 mb-3 font-medium">Detailed Log</div>
              <div className="space-y-2 text-sm font-mono">
                <LogRow label="Model" value={metadata.effectiveModel} />
                <LogRow label="Model Tier" value={`${metadata.modelTierLabel} (${metadata.modelTier})`} />
                <LogRow label="Prompt Tier" value={`${metadata.promptTier} — ${metadata.promptTierReason}`} />
                <LogRow label="Prompt Path" value={metadata.promptPath} />
                <LogRow label="Format" value={metadata.formatKey} />
                <LogRow label="Modules" value={metadata.modulesAttached.join(", ") || "none"} />
                <LogRow label="System Tokens (est.)" value={String(metadata.systemPromptTokenEstimate)} />
                <LogRow label="V2 Summary" value={metadata.v2SummaryUsed ? `Yes (${metadata.v2SummaryTokens ?? "?"} tokens)` : "No"} />
                <LogRow label="Deck Context Source" value={metadata.deckContextSource} />
                <LogRow label="Commander" value={metadata.deckCommander ?? "—"} />
                <LogRow label="Deck Card Count" value={metadata.deckCardCount != null ? String(metadata.deckCardCount) : "—"} />
                <LogRow label="Deck Facts" value={metadata.deckFactsPresent ? "Yes" : "No"} />
                <LogRow label="Synergy Diagnostics" value={metadata.synergyDiagnosticsPresent ? "Yes" : "No"} />
                <LogRow label="Messages in Context" value={String(metadata.messageCount)} />
                <LogRow label="OpenAI" value={metadata.openaiOk ? `OK (${metadata.openaiElapsedMs}ms)` : `Error: ${metadata.openaiError ?? "—"}`} />
                <LogRow label="Input Tokens" value={metadata.inputTokens != null ? String(metadata.inputTokens) : "—"} />
                <LogRow label="Output Tokens" value={metadata.outputTokens != null ? String(metadata.outputTokens) : "—"} />
                <div className="pt-2 border-t border-neutral-700 mt-2">
                  <div className="text-xs text-neutral-500 mb-1">Accuracy Checks</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip ok={metadata.accuracyChecks.cardNamesBracketed} label="Card names [[bracketed]]" />
                    <Chip ok={metadata.accuracyChecks.noRawCardDump} label="No raw dump" />
                    <Chip ok={metadata.accuracyChecks.reasonableLength} label="Reasonable length" />
                  </div>
                </div>
                {metadata.systemPromptPreview && (
                  <details className="pt-2 border-t border-neutral-700 mt-2">
                    <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300">
                      System prompt preview
                    </summary>
                    <pre className="mt-2 p-2 bg-neutral-950 rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap break-words">
                      {metadata.systemPromptPreview}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
          {(response || metadata) && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={exportResult}
                className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
              >
                Export
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-neutral-500 shrink-0 w-40">{label}</span>
      <span className="text-neutral-200 break-all">{value}</span>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${ok ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}
    >
      {label}: {ok ? "✓" : "✗"}
    </span>
  );
}
