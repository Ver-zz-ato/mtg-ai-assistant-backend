"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AdminPromptPreviewPayload } from "@/lib/ai/admin-prompt-preview-types";

function NotExposed() {
  return <span className="text-neutral-500 italic">not exposed</span>;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs border-b border-neutral-800 pb-2 last:border-b-0">
      <div className="text-neutral-500">{label}</div>
      <div className="text-neutral-200 font-mono break-all">{value}</div>
    </div>
  );
}

function stringifyVal(v: unknown): React.ReactNode {
  if (v === undefined) return <NotExposed />;
  if (v === null) return "null";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 0);
  } catch {
    return String(v);
  }
}

function debugField(
  record: Record<string, unknown> | null | undefined,
  key: string,
  opts?: { treatNullAsMissing?: boolean },
): React.ReactNode {
  if (!record || !(key in record)) return <NotExposed />;
  const v = record[key];
  if (v === undefined || (opts?.treatNullAsMissing && v === null)) return <NotExposed />;
  return stringifyVal(v);
}

async function consumeChatStreamDebug(
  response: Response,
  onDelta: (chunk: string) => void,
  onDebugPayload: (data: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const ct = response.headers.get("content-type");
  if (ct?.includes("application/json")) {
    const json = (await response.json()) as Record<string, unknown>;
    throw new Error(
      typeof json?.error === "object" && json?.error !== null && "message" in (json.error as object)
        ? String((json.error as { message: string }).message)
        : typeof json.message === "string"
          ? json.message
          : `HTTP ${response.status} (JSON)`
    );
  }
  if (!response.ok) {
    throw new Error(response.status === 405 ? "Chat request rejected (405)." : `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("No response stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let debugParsedStart = false;

  // Mirrors lib/threads.ts postMessageStreamWithDebug parsing (SSE-style plain text chunks + markers).
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = await reader.read();
    if (done) {
      if (debugParsedStart && buffer.length > 0) onDelta(buffer.trimEnd());
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    if (!debugParsedStart && buffer.includes("__MANATAP_DEBUG__")) {
      const endMarker = "__MANATAP_DEBUG_END__";
      const endIdx = buffer.indexOf(endMarker);
      if (endIdx >= 0) {
        const startIdx = buffer.indexOf("__MANATAP_DEBUG__") + "__MANATAP_DEBUG__".length;
        const jsonStr = buffer.slice(startIdx, endIdx).replace(/^\n/, "").trim();
        try {
          onDebugPayload(JSON.parse(jsonStr) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        buffer = buffer.slice(endIdx + endMarker.length);
        debugParsedStart = true;
      }
    }

    if (buffer.includes("[DONE]")) {
      let beforeDone = buffer.split("[DONE]")[0] ?? "";
      if (beforeDone && debugParsedStart) {
        const endStreamMarker = "__MANATAP_DEBUG_END_STREAM__";
        const endStreamEnd = "__MANATAP_DEBUG_END__";
        if (beforeDone.includes(endStreamMarker)) {
          const idx = beforeDone.indexOf(endStreamMarker);
          const contentPart = beforeDone.slice(0, idx).trimEnd();
          if (contentPart) onDelta(contentPart);
          const endIdxAfter = beforeDone.indexOf(endStreamEnd, idx);
          if (endIdxAfter >= 0) {
            const jsonStr = beforeDone.slice(idx + endStreamMarker.length, endIdxAfter).replace(/^\n/, "").trim();
            try {
              onDebugPayload(JSON.parse(jsonStr) as Record<string, unknown>);
            } catch {
              /* ignore */
            }
          }
        } else {
          if (beforeDone.trim()) onDelta(beforeDone);
        }
      } else if (beforeDone.trim()) {
        onDelta(beforeDone.replace(/^\s+$/, ""));
      }
      break;
    }

    if (debugParsedStart && buffer.length > 0) {
      const chunk = buffer;
      buffer = "";
      const filtered = chunk.replace(/^\s+$/, "");
      if (filtered) onDelta(filtered);
    }
  }
}

/** Compact collapsible preview; mirrors admin/chat-test summaries without coupling to Chat component */
function PromptPreviewSummary({ preview }: { preview: AdminPromptPreviewPayload | null }) {
  if (!preview) {
    return <p className="text-[11px] text-neutral-500">No preview (enable admin prompt preview headers; full tier prompts include more sections).</p>;
  }

  const copy = () => void navigator.clipboard.writeText(preview.final_system_prompt_exact || "");

  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-end">
        <button type="button" className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px]" onClick={copy}>
          Copy final prompt
        </button>
      </div>
      <pre className="p-2 bg-neutral-950 rounded text-[11px] text-neutral-400 whitespace-pre-wrap font-mono max-h-48 overflow-auto">
        {[
          `stream_injected: ${preview.stream_injected}`,
          `selected_prompt_tier: ${preview.selected_prompt_tier}`,
          `prompt_path: ${preview.prompt_path}`,
          `model_tier: ${preview.model_tier}`,
        ].join("\n")}
      </pre>
      <details className="border border-neutral-800 rounded">
        <summary className="cursor-pointer p-2 text-neutral-400">final_system_prompt_exact</summary>
        <pre className="p-2 max-h-[40vh] overflow-auto text-[11px] font-mono text-neutral-300 whitespace-pre-wrap break-words">
          {preview.final_system_prompt_exact || "—"}
        </pre>
      </details>
    </div>
  );
}

export default function AdminChatDebugPage() {
  const [message, setMessage] = useState("Analyze my deck briefly.");
  const [deckId, setDeckId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [formatOverride, setFormatOverride] = useState("");
  const [useStream, setUseStream] = useState(true);

  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [debugPhases, setDebugPhases] = useState<Record<string, unknown>[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startDebug = debugPhases.find((p) => p.phase === "start") ?? null;
  const sd = startDebug as Record<string, unknown> | undefined;
  const cfr = sd?.chat_format_resolution as Record<string, unknown> | undefined;
  const adc = startDebug?.active_deck_context as Record<string, unknown> | undefined;
  const ppc = startDebug?.prompt_contract as Record<string, unknown> | undefined;
  const promptPreviewPayload = startDebug?.prompt_preview as AdminPromptPreviewPayload | null | undefined;

  const runTest = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErrorText(null);
    setHttpStatus(null);
    setStreamText("");
    setDebugPhases([]);

    const text = message.trim();
    if (!text) {
      setErrorText("Message is required.");
      setLoading(false);
      return;
    }

    const context: Record<string, string | null> = {};
    if (deckId.trim()) context.deckId = deckId.trim();
    if (formatOverride.trim()) context.format = formatOverride.trim();

    const body: Record<string, unknown> = {
      text,
      threadId: threadId.trim() || null,
      sourcePage: "admin-chat-debug",
    };
    if (Object.keys(context).length > 0) body.context = context;

    try {
      if (useStream) {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/plain",
            "x-debug-chat": "1",
            "x-admin-prompt-preview": "1",
          },
          body: JSON.stringify(body),
          signal: ac.signal,
          credentials: "include",
        });
        setHttpStatus(res.status);
        await consumeChatStreamDebug(
          res,
          (delta) =>
            setStreamText((prev) => {
              return prev + delta;
            }),
          (data) => setDebugPhases((prev) => [...prev, data]),
          ac.signal
        );
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
          credentials: "include",
        });
        setHttpStatus(res.status);
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const j = await res.json();
          if (!res.ok) {
            setErrorText(typeof j?.error === "string" ? j.error : JSON.stringify(j));
            setStreamText("");
          } else {
            setStreamText(typeof j?.text === "string" ? j.text : JSON.stringify(j, null, 2));
          }
        } else {
          setStreamText(await res.text());
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setErrorText(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [message, deckId, threadId, formatOverride, useStream]);

  return (
    <main className="max-w-[1400px] mx-auto p-4 text-neutral-100 min-h-screen space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Chat Debug (admin)</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Simulate <code className="text-neutral-400">/api/chat/stream</code> with debug headers — same guards as Chat Test / production (admin + logged-in cookie).
          </p>
        </div>
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white underline">
          ← JustForDavy
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-sm font-medium text-neutral-300">Inputs</h2>

          <label className="block text-xs text-neutral-500">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-mono"
          />

          <label className="block text-xs text-neutral-500">deckId (optional)</label>
          <input
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-mono"
            placeholder="UUID"
          />

          <label className="block text-xs text-neutral-500">threadId (optional)</label>
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-mono"
            placeholder="UUID"
          />

          <label className="block text-xs text-neutral-500">context.format override (optional)</label>
          <input
            value={formatOverride}
            onChange={(e) => setFormatOverride(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="e.g. Commander, Modern"
          />

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
            Use stream route (POST /api/chat/stream)
          </label>

          <button
            type="button"
            disabled={loading}
            onClick={runTest}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium text-sm"
          >
            {loading ? "Running…" : "Run test"}
          </button>
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-900/40 p-4 overflow-auto max-h-[min(80vh,900px)]">
          <div className="text-xs text-neutral-500 mb-2">HTTP status: {httpStatus !== null ? httpStatus : "—"}</div>
          {errorText && <div className="text-sm text-red-400 border border-red-900/50 rounded p-2">{errorText}</div>}

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1">Format</h3>
          <div className="space-y-2">
            <KV label="canonical (chat_format_resolution)" value={debugField(cfr, "canonical")} />
            <KV label="format_source" value={debugField(cfr, "format_source")} />
            <KV label="rawDeck" value={debugField(cfr, "rawDeck")} />
            <KV label="rawRequest" value={debugField(cfr, "rawRequest")} />
            <KV label="format_key (prompt layers)" value={debugField(sd, "format_key")} />
          </div>

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1 pt-2">Commander / gating</h3>
          <div className="space-y-2">
            <KV label="commanderLayersOn" value={debugField(sd, "commanderLayersOn")} />
            <KV label="applyCommanderNameGating" value={debugField(sd, "applyCommanderNameGating")} />
            <KV label="commanderName" value={adc?.commanderName !== undefined ? stringifyVal(adc.commanderName) : <NotExposed />} />
            <KV label="commanderStatus" value={adc?.commanderStatus !== undefined ? stringifyVal(adc.commanderStatus) : <NotExposed />} />
          </div>

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1 pt-2">Decision</h3>
          <div className="space-y-2">
            <KV
              label="mayAnalyze"
              value={debugField(sd, "mayAnalyze", { treatNullAsMissing: true })}
            />
            <KV label="askReason" value={adc?.askReason !== undefined ? stringifyVal(adc.askReason) : <NotExposed />} />
            <KV label="streamInjected (prompt_mode)" value={startDebug?.prompt_mode !== undefined ? stringifyVal(startDebug.prompt_mode) : <NotExposed />} />
            <KV label="prompt tier (prompt_tier)" value={startDebug?.prompt_tier !== undefined ? stringifyVal(startDebug.prompt_tier) : <NotExposed />} />
            <KV label="decision (prompt_contract.injected)" value={ppc?.injected !== undefined ? stringifyVal(ppc.injected) : <NotExposed />} />
            <KV label="decision_reason" value={ppc?.decision_reason !== undefined ? stringifyVal(ppc.decision_reason) : <NotExposed />} />
          </div>

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1 pt-2">Deck counts</h3>
          <div className="space-y-2">
            <KV label="deck loaded (active_deck_context.hasDeck)" value={adc?.hasDeck !== undefined ? stringifyVal(adc.hasDeck) : <NotExposed />} />
            <KV label="deck_context_cards (# lines in compose)" value={debugField(sd, "deck_context_cards")} />
            <KV label="deck_card_count (Σ qty)" value={debugField(sd, "deck_card_count", { treatNullAsMissing: true })} />
            <KV label="mainboard_card_count" value={debugField(sd, "mainboard_card_count", { treatNullAsMissing: true })} />
            <KV label="sideboard_card_count" value={debugField(sd, "sideboard_card_count", { treatNullAsMissing: true })} />
            <KV label="v2_card_count" value={debugField(sd, "v2_card_count", { treatNullAsMissing: true })} />
          </div>

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1 pt-2">Prompt preview</h3>
          <PromptPreviewSummary preview={promptPreviewPayload ?? null} />

          <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-1 pt-2">Raw debug JSON (all phases)</h3>
          <pre className="text-[10px] font-mono text-neutral-500 max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {debugPhases.length ? JSON.stringify(debugPhases, null, 2) : "—"}
          </pre>
        </section>
      </div>

      <section className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-300 mb-2">Streamed assistant text</h2>
        {!useStream && (
          <p className="text-xs text-amber-600/90 mb-2">
            Non-stream mode: no debug injection; body is the normal /api/chat JSON envelope (text shown below).
          </p>
        )}
        <pre className="min-h-[180px] p-3 rounded bg-neutral-950 border border-neutral-800 text-sm font-mono text-neutral-200 whitespace-pre-wrap break-words">
          {streamText || "—"}
        </pre>
      </section>

      <section className="text-xs text-neutral-500 space-y-2 border-t border-neutral-800 pt-4">
        <p>
          <strong className="text-neutral-400">Wire notes:</strong> With <code>x-debug-chat</code>, the start payload includes <code>chat_format_resolution</code>,{" "}
          <code>commanderLayersOn</code>, <code>applyCommanderNameGating</code>, <code>mayAnalyze</code> (full tier only; otherwise omitted / null treated as &quot;not exposed&quot;
          above), and zone splits for <strong>linked</strong> decks from <code>deck_cards</code>. Pasted/thread deck text without DB zones does not populate mainboard/sideboard
          splits (counts stay null server-side → not exposed here).
        </p>
        <p>
          Normal chat responses without <code>x-debug-chat</code> are unchanged (no debug block).
        </p>
      </section>
    </main>
  );
}
