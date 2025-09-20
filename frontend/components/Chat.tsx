"use client";
import { useEffect, useState } from "react";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import { listMessages, postMessage } from "@/lib/threads";
import type { ChatMessage } from "@/types/chat";

const DEV = process.env.NODE_ENV !== "production";

function isDecklist(text: string): boolean {
  if (!text) return false;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  let hits = 0;
  const rxQty = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const rxDash = /^-\s+.+$/;
  for (const l of lines) {
    if (rxQty.test(l) || rxDash.test(l)) hits++;
  }
  if (DEV) console.log("[detect] lines", lines.length, "hits", hits);
  return hits >= Math.max(6, Math.floor(lines.length * 0.5));
}

type AnalysisPayload = {
  type: "analysis";
  data: {
    score: number;
    note?: string;
    bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
    curveBuckets: number[];
    whatsGood?: string[];
    quickFixes?: string[];
    illegalByCI?: number;
    illegalExamples?: string[];
  };
};

async function appendAssistant(threadId: string, content: string) {
  const res = await fetch("/api/chat/messages/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, role: "assistant", content }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "append failed");
  return true;
}

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [lastDeck, setLastDeck] = useState<string>("");

  async function refreshMessages(tid: string | null) {
    if (!tid) { setMessages([]); return; }
    try {
      const { messages } = await listMessages(tid);
      setMessages(messages);
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("thread not found")) {
        setThreadId(null);
        setMessages([]);
        setHistKey(k => k + 1);
        return;
      }
      throw e;
    }
  }
  useEffect(() => { refreshMessages(threadId); }, [threadId]);

  async function saveDeck() {
    if (!lastDeck?.trim()) return;
    try {
      const title = (lastDeck.split("\n").find(Boolean) || "Imported Deck").replace(/^\d+\s*[xX]?\s*/, "").slice(0, 64);
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          format: "Commander",
          plan: "Optimized",
          colors: [],
          currency: "USD",
          deck_text: lastDeck,
          data: { source: "chat-inline" },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "Save failed");
      alert("Saved! Check My Decks.");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  }

  function gotoMyDecks() { window.location.href = "/my-decks"; }

  async function send() {
    if (!text.trim() || busy) return;
    const val = text;
    const looksDeck = isDecklist(val);
    if (looksDeck) setLastDeck(val);
    if (DEV) console.log("[send] looksDeck?", looksDeck);

    setText("");
    setBusy(true);
    setMessages(m => [
      ...m,
      { id: Date.now(), thread_id: threadId || "", role: "user", content: val, created_at: new Date().toISOString() } as any,
    ]);

    const res = await postMessage(val, threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));

    let tid = threadId as string | null;
    if ((res as any)?.ok) {
      tid = (res as any).threadId as string;
      if (tid !== threadId) setThreadId(tid);
      setHistKey(k => k + 1);
      await refreshMessages(tid);
    } else {
      setToast(res?.error?.message || "Chat failed");
      setMessages(m => [
        ...m,
        { id: Date.now() + 1, thread_id: threadId || "", role: "assistant", content: "Sorry — " + ((res as any)?.error?.message ?? "no reply"), created_at: new Date().toISOString() } as any,
      ]);
    }

    if (looksDeck) {
      try {
        const ar = await fetch("/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deckText: val, useScryfall: true }),
        });
        const textBody = await ar.text();
        let parsed: any = null;
        try { parsed = JSON.parse(textBody); } catch { parsed = null; }
        const result = parsed?.result ?? parsed;
        if (ar.ok && result && (tid || threadId)) {
          const payload: AnalysisPayload = { type: "analysis", data: result };
          const content = JSON.stringify(payload);
          const threadForAppend = tid || threadId!;
          setMessages(m => [
            ...m,
            { id: Date.now() + 2, thread_id: threadForAppend, role: "assistant", content, created_at: new Date().toISOString() } as any,
          ]);
          await appendAssistant(threadForAppend, content);
          await refreshMessages(threadForAppend);
        } else if (DEV) {
          console.warn("[analyze] bad response", parsed);
        }
      } catch (e) { if (DEV) console.warn("[analyze] failed", e); }
    }

    setBusy(false);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <HistoryDropdown key={histKey} value={threadId} onChange={setThreadId} />
        </div>
      </div>

      <div className="w-full">
        <ThreadMenu
          threadId={threadId}
          onChanged={() => setHistKey(k => k + 1)}
          onDeleted={() => { setThreadId(null); setMessages([]); setHistKey(k => k + 1); }}
        />
      </div>

      <div className="min-h-[40vh] space-y-2 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded p-3">
        {messages.length === 0 ? (
          <div className="text-neutral-400">Start a new chat or pick a thread above.</div>
        ) : messages.map((m) => {
          try {
            const obj = JSON.parse(m.content);
            if (obj && obj.type === "analysis" && obj.data) {
              return (
                <div key={m.id} className="text-right">
                  <div className="inline-block max-w-[100%]">
                    <DeckHealthCard result={obj.data} onSave={saveDeck} onMyDecks={gotoMyDecks} />
                  </div>
                </div>
              );
            }
          } catch {}
          const isAssistant = m.role === "assistant";
          return (
            <div key={m.id} className={isAssistant ? "text-right" : "text-left"}>
              <div
                className={
                  "inline-block max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap " +
                  (isAssistant ? "bg-blue-900/40" : "bg-neutral-800")
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                  {isAssistant ? "assistant" : "user"}
                </div>
                <div className="leading-relaxed">{m.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask anything or paste a decklist… (Shift+Enter for newline)"
          rows={3}
          className="flex-1 bg-neutral-900 text-white border border-neutral-700 rounded px-3 py-2 resize-y"
        />
        <button onClick={send} disabled={busy || !text.trim()} className="px-4 py-2 h-fit self-end rounded bg-blue-600 text-white disabled:opacity-60">
          {busy ? "…" : "Send"}
        </button>
      </div>
    {toast && (<div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-3 py-2 rounded shadow">{toast}</div>)}
  </div>
  );
}
