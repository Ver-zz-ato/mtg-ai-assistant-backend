"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import { listMessages, postMessage } from "@/lib/threads";
import { capture } from "@/lib/ph";
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
  const [lastDeck, setLastDeck] = useState<string>("");
  const [fmt, setFmt] = useState<'commander'|'standard'|'modern'>('commander');
  const [colors, setColors] = useState<{[k in 'W'|'U'|'B'|'R'|'G']: boolean}>({W:false,U:false,B:false,R:false,G:false});
  const [budget, setBudget] = useState<'budget'|'optimized'|'luxury'>('optimized');

  let currentAbort: AbortController | null = null;
async function refreshMessages(tid: string | null) {
    if (!tid) { setMessages([]); return; }
    
try {
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController();
      const { messages } = await listMessages(tid);
      setMessages(Array.isArray(messages) ? messages : []);
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
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController();
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
      try { const tc = await import("@/lib/toast-client"); tc.toast("Saved! Check My Decks.", "success"); } catch { alert("Saved! Check My Decks."); }
    } catch (e: any) {
      try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message ?? "Save failed"); } catch { alert(e?.message ?? "Save failed"); }
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

capture('chat_sent', { chars: (val?.length ?? 0), thread_id: threadId ?? null });
    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k) };
    const res = await postMessage({ text: val, threadId }, threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));

    let tid = threadId as string | null;
    if ((res as any)?.ok) {
      tid = (res as any).threadId as string;
      if (tid !== threadId) setThreadId(tid);
      setHistKey(k => k + 1);
      // Immediately ask the assistant to reply using current preferences
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: val, threadId: tid, prefs, noUserInsert: true }),
        });
      } catch {}
      await refreshMessages(tid);
    } else {
      try { const tc = await import("@/lib/toast-client"); tc.toastError(res?.error?.message || "Chat failed"); } catch {}
      setMessages(m => [
        ...m,
        { id: Date.now() + 1, thread_id: threadId || "", role: "assistant", content: "Sorry — " + ((res as any)?.error?.message ?? "no reply"), created_at: new Date().toISOString() } as any,
      ]);
    }

    if (looksDeck) {
      
try {
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController();
        const ar = await fetch("/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deckText: val, useScryfall: true }),
        });
        const textBody = await ar.text();
        let parsed: any = null;
        
try {
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController(); parsed = JSON.parse(textBody); } catch { parsed = null; }
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

  function CardChips({ names }: { names: string[] }) {
    const [imgs, setImgs] = useState<Record<string, { thumb: string; large: string }>>({});
    const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean }>({ src: "", x: 0, y: 0, shown: false });
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const { getImagesForNames } = await import("@/lib/scryfall");
          const m = await getImagesForNames(names);
          if (!mounted) return;
          const obj: Record<string, { thumb: string; large: string }> = {};
          m.forEach((v,k)=>{
            const thumb = v.small || v.normal || v.art_crop || "";
            const large = v.normal || v.small || v.art_crop || ""; // full card image preferred
            if (thumb) obj[k] = { thumb, large };
          });
          setImgs(obj);
        } catch {}
      })();
      return () => { mounted = false; };
    }, [names.join('|')]);

    const keys = Object.keys(imgs);
    if (keys.length === 0) return null;
    const MAX = 5; const shown = keys.slice(0, MAX); const more = keys.length - shown.length;
    return (
      <div className="mt-2 flex items-center gap-1">
        {shown.map(k => (
          <div
            key={k}
            className="relative"
            onMouseEnter={(e) => {
              setPv({ src: imgs[k].large, x: e.clientX, y: e.clientY - 16, shown: true });
            }}
            onMouseMove={(e) => {
              setPv(p => p.shown ? { ...p, x: e.clientX, y: e.clientY - 16 } : p);
            }}
            onMouseLeave={() => setPv(p => ({ ...p, shown: false }))}
          >
            <img src={imgs[k].thumb} alt={k} loading="lazy" decoding="async" className="w-10 h-14 object-cover rounded" />
          </div>
        ))}
        {more > 0 && (
          <span className="text-[10px] px-2 py-1 rounded bg-neutral-700 text-white">+{more}</span>
        )}
        {pv.shown && typeof window !== 'undefined' && createPortal(
          <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: 'translate(-50%, -100%)' }}>
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
              <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Preferences strip (moved above thread selector) */}
      <div className="w-full mb-2 border border-neutral-800 bg-neutral-900/60 rounded-lg px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-2">
            <span className="opacity-70">Format:</span>
            {(['commander','standard','modern'] as const).map(f => (
              <button
                key={f}
                onClick={()=>setFmt(f)}
                className={`px-3 py-2 rounded border ${fmt===f?'bg-blue-700 text-white border-blue-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
              >{f}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-70">Colors:</span>
            {(['W','U','B','R','G'] as const).map(c => (
              <button
                key={c}
                onClick={()=>setColors(s=>({...s,[c]:!s[c]}))}
                className={`px-3 py-2 rounded border ${colors[c]?'bg-green-700 text-white border-green-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
              >{c}</button>
            ))}
            <button
              onClick={()=>setColors({W:false,U:false,B:false,R:false,G:false})}
              className="px-3 py-2 rounded border bg-neutral-900 border-neutral-700 hover:bg-neutral-800"
              title="Clear colors"
            >Clear</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-70">Value:</span>
            {(['budget','optimized','luxury'] as const).map(b => (
              <button
                key={b}
                onClick={()=>setBudget(b)}
                className={`px-3 py-2 rounded border ${budget===b?'bg-emerald-700 text-white border-emerald-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
              >{b}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <HistoryDropdown data-testid="history-dropdown" key={histKey} value={threadId} onChange={setThreadId} />
        </div>
      </div>

      <div className="w-full">
        <ThreadMenu
          threadId={threadId}
          onChanged={() => setHistKey(k => k + 1)}
          onDeleted={() => { setThreadId(null); setMessages([]); setHistKey(k => k + 1); }}
        />
      </div>

      <div className="min-h-[40vh] space-y-4 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded p-3 pb-8 overflow-x-hidden">
        {(!Array.isArray(messages) || messages.length === 0) ? (
          <div className="text-neutral-400">Start a new chat or pick a thread above.</div>
        ) : messages.map((m) => {
          
try {
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController();
            const obj = JSON.parse(m.content);
            if (obj && obj.type === "analysis" && obj.data) {
              return (
                <div key={m.id} className="text-right">
                  <div className="inline-block max-w-[100%] sm:max-w-[80%]">
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
                  "inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
                  (isAssistant ? "bg-blue-900/40" : "bg-neutral-800")
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                  <span>{isAssistant ? "assistant" : "user"}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText?.(String(m.content || ''))}
                    className="text-[10px] px-2 py-[2px] rounded bg-neutral-700 hover:bg-neutral-600"
                    title="Copy message"
                  >
                    Copy
                  </button>
                </div>
                <div className="leading-relaxed">{m.content}</div>
                {/* Card image chips (simple detector) */}
                {(() => {
                  const text = String(m.content || '');
                  const rawLines = text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
                  const candidates: string[] = [];
                  for (const l of rawLines) {
                    // Decklist-like: "1 Sol Ring" or "Sol Ring x1"
                    const mm = l.match(/^(?:SB:\s*)?(\d+)\s*[xX]?\s+(.+)$/) || l.match(/^(.+?)\s+[xX]\s*(\d+)$/);
                    if (mm) { const name = (mm[2] || mm[1] || '').trim(); if (name) candidates.push(name); continue; }
                    // "show me <card>" pattern
                    const sm = l.match(/^(?:show\s+me|show|card|image)\s+([A-Za-z][A-Za-z'\-\s]{1,40})$/i);
                    if (sm) { const name = sm[1].trim(); if (name.split(/\s+/).length <= 6) candidates.push(name); continue; }
                    // Short capitalized-like line (2–5 words, letters/spaces)
                    if (/^[A-Za-z][A-Za-z'\-\s]+$/.test(l)) {
                      const words = l.split(/\s+/);
                      if (words.length >= 1 && words.length <= 5) candidates.push(l);
                    }
                  }
                  const names = Array.from(new Set(candidates)).slice(0, 12);
                  if (names.length === 0) return null;
                  return <CardChips names={names} />;
                })()}
                {isAssistant && (/\bdeck\b|\bswap\b|\bcollection\b|\bowned\b/i.test(String(m.content || ''))) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
                    <span className="opacity-70">Quick actions:</span>
                    <a className="underline underline-offset-4" href="/collections/cost-to-finish" onClick={() => { try { capture('nudge_cost_to_finish_from_reply'); } catch {} }}>Run Cost-to-Finish</a>
                    <a className="underline underline-offset-4" href="/deck/swap-suggestions" onClick={() => { try { capture('nudge_swaps_from_reply'); } catch {} }}>Find Budget Swaps</a>
                    <a className="underline underline-offset-4" href="#" onClick={() => { try { capture('nudge_judger_from_reply'); } catch {} }}>Analyze/Judge</a>
                    {/* Probability/Mulligan nudges if relevant */}
                    {(/\bprobability\b|\bodds\b|\bchance\b|\bhypergeometric\b/i.test(String(m.content || ''))) && (
                      <a className="underline underline-offset-4" href="/tools/probability" onClick={() => { try { capture('nudge_probability_from_reply'); } catch {} }}>Probability Helpers</a>
                    )}
                    {(/\bmulligan\b|\bkeep\s+hand\b|\blondon\s+mulligan\b/i.test(String(m.content || ''))) && (
                      <a className="underline underline-offset-4" href="/tools/mulligan" onClick={() => { try { capture('nudge_mulligan_from_reply'); } catch {} }}>Mulligan Simulator</a>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nudges: show when current text looks like a decklist or mentions collection */}
      {(isDecklist(text) || /\bcollection\b|\bowned\b|\bmy\s+cards\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Looks like a deck:</span>
          <a className="underline underline-offset-4" href="/collections/cost-to-finish" onClick={() => { try { capture('nudge_cost_to_finish'); } catch {} }}>Run Cost-to-Finish</a>
          <a className="underline underline-offset-4" href="/deck/swap-suggestions" onClick={() => { try { capture('nudge_swaps'); } catch {} }}>Find Budget Swaps</a>
          <a className="underline underline-offset-4" href="#" onClick={() => { setLastDeck(text); saveDeck(); try { capture('nudge_judger'); } catch {} }}>Analyze/Judge</a>
        </div>
      )}

      {/* Nudges: Probability / Mulligan topics */}
      {(/\bprobability\b|\bodds\b|\bchance\b|\bhypergeometric\b|\bdraws?\s+by\s+turn\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Math-y question?</span>
          <a className="underline underline-offset-4" href="/tools/probability" onClick={() => { try { capture('nudge_probability'); } catch {} }}>Open Probability Helpers</a>
        </div>
      )}
      {(/\bmulligan\b|\bkeep\s+hand\b|\blondon\s+mulligan\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Wondering about mulligans?</span>
          <a className="underline underline-offset-4" href="/tools/mulligan" onClick={() => { try { capture('nudge_mulligan'); } catch {} }}>Open Mulligan Simulator</a>
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          data-testid="chat-textarea"
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
        <button onClick={send} disabled={busy || !text.trim()} className="px-4 py-2 h-fit self-end rounded bg-blue-600 text-white disabled:opacity-60" data-testid="chat-send">
          {busy ? "…" : "Send"}
        </button>
      </div>
  </div>
  );
}
