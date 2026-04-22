"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  costAuditClientLog,
  costAuditRequestId,
  isCostAuditClientEnabled,
} from "@/lib/observability/cost-audit";
import {
  getPublicShoutPollMs,
  getPublicShoutRealtimeMode,
} from "@/lib/shoutbox/realtime-config";

type Shout = { id: number; user: string; text: string; ts: number };

type HistorySource = "initial" | "poll" | "post" | "visibility";

function shoutsFingerprint(items: Shout[]): string {
  return items.map((m) => `${m.id}\u0000${m.ts}\u0000${m.user}\u0000${m.text}`).join("\n");
}

// Format timestamp as relative time (e.g., "2m", "1h", "1d")
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  return `${diffDay}d`;
}

export default function Shoutbox() {
  const [items, setItems] = useState<Shout[]>([]);
  const [name, setName] = useState<string>("Anon");
  const [text, setText] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [posting, setPosting] = useState<boolean>(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const evRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mountSessionRef = useRef<string | null>(null);
  const historyReloadRef = useRef<
    ((source: HistorySource) => Promise<void>) | null
  >(null);

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items.length]);

  useEffect(() => {
    const realtimeMode = getPublicShoutRealtimeMode();
    const pollMs = getPublicShoutPollMs();
    const session = isCostAuditClientEnabled() ? costAuditRequestId() : "";
    mountSessionRef.current = session;

    if (isCostAuditClientEnabled()) {
      costAuditClientLog({
        event: "client.shoutbox.mount",
        component: "Shoutbox",
        session,
        realtimeMode,
        pollMs: realtimeMode === "poll" ? pollMs : undefined,
      });
    }

    let closed = false;
    let inFlightBusy = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let onVis: (() => void) | null = null;

    async function loadHistory(historySource: HistorySource) {
      if (closed) return;
      if (inFlightBusy) {
        if (historySource === "poll") return;
        while (inFlightBusy) {
          await new Promise((r) => setTimeout(r, 25));
          if (closed) return;
        }
      }
      inFlightBusy = true;
      try {
        if (isCostAuditClientEnabled() && historySource === "initial") {
          costAuditClientLog({
            event: "client.shoutbox.history_start",
            session: mountSessionRef.current,
            historySource,
          });
        }
        const r = await fetch("/api/shout/history", { cache: "no-store" });
        const j = await r.json().catch(() => ({ items: [] }));
        const sorted = (((j.items as Shout[]) || []) as Shout[]).slice().sort((a, b) => a.ts - b.ts);
        if (isCostAuditClientEnabled()) {
          costAuditClientLog({
            event: "client.shoutbox.history_done",
            session: mountSessionRef.current,
            ok: r.ok,
            status: r.status,
            itemCount: sorted.length,
            historySource,
            realtimeMode,
          });
        }
        if (!closed) {
          setItems((prev) => {
            if (shoutsFingerprint(prev) === shoutsFingerprint(sorted)) return prev;
            return sorted;
          });
          if (historySource === "initial" && sorted.length === 0) {
            if (isCostAuditClientEnabled()) {
              costAuditClientLog({
                event: "client.shoutbox.auto_generate_seed",
                session: mountSessionRef.current,
              });
            }
            fetch("/api/shout/auto-generate?seed=true", { method: "GET" }).catch(() => {});
          }
        }
      } catch {
        /* keep prior items */
      } finally {
        inFlightBusy = false;
      }
    }

    historyReloadRef.current = loadHistory;

    const timeoutId = setTimeout(() => {
      void (async () => {
        await loadHistory("initial");
        if (closed) return;

        if (realtimeMode === "sse") {
          const { createSecureEventSource, logConnectionError } = await import("@/lib/secure-connections");
          if (isCostAuditClientEnabled()) {
            costAuditClientLog({
              event: "client.shoutbox.sse_connect",
              session: mountSessionRef.current,
              realtimeMode: "sse",
            });
          }
          const ev = createSecureEventSource("/api/shout/stream");
          evRef.current = ev;

          ev.onmessage = (e) => {
            try {
              const msg = JSON.parse((e as MessageEvent).data) as Shout;
              setItems((prev) =>
                [...prev, msg].sort((a, b) => a.ts - b.ts).slice(-100)
              );
            } catch {
              /* ignore */
            }
          };

          ev.onerror = () => {
            if (ev.readyState === EventSource.CLOSED) {
              logConnectionError("EventSource connection closed", {
                type: "eventsource",
                url: "/api/shout/stream",
                readyState: ev.readyState,
              });
            }
          };
          return;
        }

        const scheduleInterval = () => {
          if (intervalId != null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          intervalId = setInterval(() => {
            if (closed || document.visibilityState !== "visible") return;
            void loadHistory("poll");
          }, pollMs);
        };

        onVis = () => {
          if (closed) return;
          if (document.visibilityState === "hidden") {
            if (intervalId != null) {
              clearInterval(intervalId);
              intervalId = null;
            }
            if (isCostAuditClientEnabled()) {
              costAuditClientLog({
                event: "client.shoutbox.poll_visibility",
                session: mountSessionRef.current,
                state: "hidden",
                realtimeMode: "poll",
              });
            }
          } else {
            if (isCostAuditClientEnabled()) {
              costAuditClientLog({
                event: "client.shoutbox.poll_visibility",
                session: mountSessionRef.current,
                state: "visible",
                realtimeMode: "poll",
              });
            }
            void loadHistory("visibility");
            scheduleInterval();
          }
        };

        document.addEventListener("visibilitychange", onVis);
        if (document.visibilityState === "visible") {
          scheduleInterval();
        }
      })();
    }, 1000);

    return () => {
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: "client.shoutbox.unmount",
          session: mountSessionRef.current,
          realtimeMode,
        });
      }
      clearTimeout(timeoutId);
      closed = true;
      historyReloadRef.current = null;
      if (onVis) document.removeEventListener("visibilitychange", onVis);
      if (intervalId != null) clearInterval(intervalId);
      evRef.current?.close();
      evRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  async function post() {
    const clean = text.trim();
    if (!clean || posting) return;
    const originalText = text;
    const originalName = name;
    setPosting(true);
    setText("");
    try {
      const res = await fetch("/api/shout/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, user: originalName || "Anon" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setText(originalText);
        throw new Error(j?.error || "Post failed");
      }
      setToast(null);
      await historyReloadRef.current?.("post");
    } catch (e: any) {
      setText(originalText);
      setToast(e?.message || "Post failed. Please try again.");
      console.error("Shoutbox post error:", e);
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      post();
    }
  }

  return (
    <div className="relative z-20 bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col h-[700px] min-h-[500px]">
      <div className="flex flex-col items-center gap-1.5 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 bg-clip-text text-transparent">
            Shoutbox
          </h2>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
        </div>
        <div className="h-0.5 w-24 bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 rounded-full animate-pulse"></div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 text-sm min-h-0 max-h-[440px]">
        {items.map((t, idx) => (
          <div key={`${t.id}-${idx}`} className="relative max-w-[92%]">
            <div className="bg-emerald-950/40 border border-emerald-700 text-emerald-100 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-emerald-300 mr-1.5">{t.user}:</span>
                  <span className="break-words">{t.text}</span>
                </div>
                <span className="text-[10px] text-emerald-500/60 shrink-0 mt-0.5">
                  {formatRelativeTime(t.ts)}
                </span>
              </div>
            </div>
            <div className="absolute left-2 -bottom-1 w-0 h-0 border-t-8 border-t-emerald-700 border-l-8 border-l-transparent"></div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); post(); }} className="mt-2 flex flex-col gap-2 overflow-hidden">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-24 shrink-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
            placeholder="Anon"
          />
          <button
            type="submit"
            onClick={(e) => { e.preventDefault(); post(); }}
            disabled={posting || !text.trim()}
            className="px-3 py-2 shrink-0 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={onKeyDown}
          onFocus={adjustTextareaHeight}
          rows={2}
          className="w-full min-h-[3rem] resize-none overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder:text-gray-500"
          placeholder="Say something…"
        />
      </form>
      {toast && (
        <div className="mt-2 text-xs text-red-300" aria-live="polite">
          {toast}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-red-600/95 text-white text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
