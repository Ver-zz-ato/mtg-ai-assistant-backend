"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import { listMessages, postMessage } from "@/lib/threads";
import { capture } from "@/lib/ph";
import type { ChatMessage } from "@/types/chat";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";


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
  async function createDeckFromIntent(intent:any){
    try{
      const r = await fetch('/api/decks/scaffold', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ intent }) });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) return j;
    } catch{}
    return null;
  }
  function InlineFeedback({ msgId, content }: { msgId: string; content: string }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [text, setText] = useState("");
    async function send(rating: number) {
      setBusy(true);
      try {
        await fetch('/api/feedback', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ rating, text }) });
        try { const { capture } = await import("@/lib/ph"); capture('chat_feedback', { rating, thread_id: threadId ?? null, msg_id: msgId }); } catch {}
        try { const tc = await import("@/lib/toast-client"); tc.toast('Thanks for the feedback!', 'success'); } catch {}
        setOpen(false); setText("");
      } catch(e:any) {
        try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Failed to send'); } catch {}
      } finally { setBusy(false); }
    }
    return (
      <>
        {!open && (
          <div className="pointer-events-auto absolute right-1 bottom-2 md:bottom-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out text-[10px]">
            <button title="Helpful" onClick={()=>send(1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👍</button>
            <button title="Not helpful" onClick={()=>send(-1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👎</button>
            <button title="Comment" onClick={()=>setOpen(true)} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">💬</button>
          </div>
        )}
        {open && (
          <div className="mt-2 w-full">
            <textarea value={text} onChange={(e)=>setText(e.target.value)} rows={3} placeholder="Optional comment"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1" />
            <div className="mt-1 flex gap-2">
              <button onClick={()=>send(1)} disabled={busy} className="px-2 py-[2px] rounded bg-emerald-600 text-white">Send 👍</button>
              <button onClick={()=>send(-1)} disabled={busy} className="px-2 py-[2px] rounded bg-red-700 text-white">Send 👎</button>
              <button onClick={()=>setOpen(false)} disabled={busy} className="px-2 py-[2px] rounded border border-neutral-600">Cancel</button>
            </div>
          </div>
        )}
      </>
    );
  }
  const [flags, setFlags] = useState<any>(null);
  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/config?key=flags', { cache:'no-store' }); const j = await r.json(); if (j?.config?.flags) setFlags(j.config.flags); } catch {} })(); }, []);
  const extrasOn = flags ? (flags.chat_extras !== false) : true;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [lastDeck, setLastDeck] = useState<string>("");
  const [fmt, setFmt] = useState<'commander'|'standard'|'modern'>('commander');
  const [colors, setColors] = useState<{[k in 'W'|'U'|'B'|'R'|'G']: boolean}>({W:false,U:false,B:false,R:false,G:false});
  const [budget, setBudget] = useState<'budget'|'optimized'|'luxury'>('optimized');
  const [teaching, setTeaching] = useState<boolean>(false);
  const [linkedDeckId, setLinkedDeckId] = useState<string | null>(null);
  const [lastCombos, setLastCombos] = useState<Array<{ line: string }>>([]);
  const COLOR_LABEL: Record<'W'|'U'|'B'|'R'|'G', string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  const [displayName, setDisplayName] = useState<string>("");
  useEffect(() => { (async () => { try { const sb = createBrowserSupabaseClient(); const { data } = await sb.auth.getUser(); const u:any = data?.user; const md:any = u?.user_metadata || {}; setDisplayName(String(md.username || u?.email || 'you')); } catch {} })(); }, []);

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
        // Clear stale local storage silently without toasting
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); } catch {}
        setThreadId(null);
        return;
      }
      throw e;
    }
  }
  // restore last thread across reloads
  useEffect(() => {
    try {
      if (!threadId) {
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('chat:last_thread') : null;
        if (saved && /^[0-9a-f\-]{36}$/i.test(saved)) setThreadId(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (threadId) {
        if (typeof window !== 'undefined') window.localStorage.setItem('chat:last_thread', String(threadId));
      }
      refreshMessages(threadId);
    } catch {}
  }, [threadId]);
  // Probe deck link for current thread so +Add can work across pages
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!threadId) { setLinkedDeckId(null); return; }
      try {
        const r = await fetch('/api/chat/threads/get', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.threads) ? j.threads : Array.isArray(j?.data) ? j.data : [];
        const one = arr.find((t:any)=>t.id===threadId);
        if (!cancelled) setLinkedDeckId(one?.deck_id || null);
      } catch { if (!cancelled) setLinkedDeckId(null); }
    }
    probe();
    return () => { cancelled = true; };
  }, [threadId]);

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
    // Detect deck intent and create scaffold proactively
    try{
      const { extractIntent } = await import('@/lib/chat/deckIntent');
      const intent = extractIntent(text);
      if (intent) {
        const res = await createDeckFromIntent(intent);
        if (res && res.id) {
          const cta = { type:'deck_scaffold', data: { id: res.id, url: res.url, title: res.title, intent } };
          try { await appendAssistant(threadId || '', JSON.stringify(cta)); } catch {}
          setMessages(m => [...m, { id: Date.now()+5, thread_id: threadId||'', role:'assistant', content: JSON.stringify(cta), created_at: new Date().toISOString() } as any]);
        }
      }
    } catch {}
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
    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k), teaching };
    const context: any = { deckId: linkedDeckId || null, budget, colors: prefs.colors, teaching };
    const res = await postMessage({ text: val, threadId, context }, threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));

    let tid = threadId as string | null;
    if ((res as any)?.ok) {
      tid = (res as any).threadId as string;
      if (tid !== threadId) setThreadId(tid);
      setHistKey(k => k + 1);
      // Server already generated assistant reply; just refresh
      await refreshMessages(tid);
      // Collect helper sections and render 1 grouped bubble
      const helper: any = { nl: null, combos: null, rules: null };
      try {
        const looksSearch = /^(?:show|find|search|cards?|creatures?|artifacts?|enchantments?)\b/i.test(val.trim());
        if (looksSearch && tid) {
          const r = await fetch(`/api/search/scryfall-nl?q=${encodeURIComponent(val)}`, { cache:'no-store' });
          const j = await r.json().catch(()=>({}));
          if (j?.ok) helper.nl = j;
        }
      } catch {}
      try {
        if (linkedDeckId && tid) {
          const d = await fetch(`/api/decks/get?id=${encodeURIComponent(linkedDeckId)}`, { cache:'no-store' });
          const dj = await d.json().catch(()=>({}));
          const commander = dj?.deck?.commander || dj?.commander || '';
          if (commander) {
            const cr = await fetch(`/api/combos?commander=${encodeURIComponent(commander)}`, { cache:'no-store' });
            const cj = await cr.json().catch(()=>({}));
            const combos = Array.isArray(cj?.combos) ? cj.combos.slice(0,3) : [];
            if (combos.length) helper.combos = { commander, combos };
          }
          // Deck-wide combo detector (present and one-piece-missing)
          try {
            const dr = await fetch(`/api/deck/combos`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckId: linkedDeckId }) });
            const dj2 = await dr.json().catch(()=>({}));
            if (dj2?.ok) helper.combos_detect = { present: dj2.present||[], missing: dj2.missing||[] };
          } catch {}
        }
      } catch {}
      try {
        const rulesy = /\b(rule|stack|priority|lifelink|flying|trample|hexproof|ward|legendary|commander|state[- ]based)\b/i.test(val);
        if (rulesy && tid) {
          const baseQ = (val.match(/\b(lifelink|flying|trample|hexproof|ward|legendary|commander|state[- ]based)\b/i)?.[1] || 'rules');
          const r = await fetch(`/api/rules/search?q=${encodeURIComponent(baseQ)}`, { cache: 'no-store' });
          const j = await r.json().catch(()=>({}));
          if (j?.ok) helper.rules = j;
        }
      } catch {}
      try {
        if (tid && (helper.nl || helper.combos || helper.rules)) {
          const content = JSON.stringify({ type:'helpers', data: helper });
          setMessages(m => [...m, { id: Date.now()+6, thread_id: tid!, role:'assistant', content, created_at: new Date().toISOString() } as any]);
          await appendAssistant(tid!, content);
          await refreshMessages(tid!);
        }
      } catch {}
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
          // Optional color filtering based on current chat color prefs
          const want = Object.entries(colors).filter(([k,v])=>v).map(([k])=>k as 'W'|'U'|'B'|'R'|'G');
          let filtered = names.slice();
          if (want.length > 0) {
            const keep: string[] = [];
            for (const nm of names.slice(0, 20)) { // cap to reduce load
              try {
                const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nm)}`, { cache: 'no-store' });
                if (!r.ok) { keep.push(nm); continue; } // if lookup fails, keep it
                const c: any = await r.json().catch(()=>({}));
                const ci: string[] = Array.isArray(c?.color_identity) ? c.color_identity : [];
                const subset = ci.every((x) => want.includes(x as any));
                if (subset) keep.push(nm);
              } catch { keep.push(nm); }
            }
            filtered = keep;
          }
          const { getImagesForNames } = await import("@/lib/scryfall");
          const m = await getImagesForNames(filtered);
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
    }, [names.join('|'), colors.W, colors.U, colors.B, colors.R, colors.G]);

    const keys = Object.keys(imgs);
    if (keys.length === 0) return null;
    const MAX = 5; const shown = keys.slice(0, MAX); const more = keys.length - shown.length;
    return (
      <div className="mt-2 flex items-center gap-3">
        <div className="flex flex-wrap gap-2 text-[11px] opacity-90">
          <button className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700" onClick={()=>setText('Brew EDH by budget: mono-red tokens under £75')}>Brew EDH by budget</button>
          <button className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700" onClick={()=>setText('Upgrade my [precon name] for £40; keep theme and color identity')}>Upgrade a precon</button>
          <button className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700" onClick={()=>setText('Port lifegain theme to Selesnya (GW) for Commander, casual power')}>Port a theme to another color</button>
          <button className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700" onClick={()=>setText('Standard Dimir Control with 24 lands; include Go for the Throat')}>Standard/Modern shell by archetype</button>
        </div>
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

  function ManaIcon({ c, active }: { c: 'W'|'U'|'B'|'R'|'G'; active: boolean }){
    const srcLocal = c==='W' ? '/mana/w.svg'
      : c==='U' ? '/mana/u.svg'
      : c==='B' ? '/mana/b.svg'
      : c==='R' ? '/mana/r.svg'
      : '/mana/g.svg';
    const srcCdn = c==='W' ? 'https://svgs.scryfall.io/card-symbols/w.svg'
      : c==='U' ? 'https://svgs.scryfall.io/card-symbols/u.svg'
      : c==='B' ? 'https://svgs.scryfall.io/card-symbols/b.svg'
      : c==='R' ? 'https://svgs.scryfall.io/card-symbols/r.svg'
      : 'https://svgs.scryfall.io/card-symbols/g.svg';
    const [src, setSrc] = useState<string>(srcCdn);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        onError={() => setSrc(srcLocal)}
        alt={`${COLOR_LABEL[c]} mana`}
        width={18}
        height={18}
        style={{ filter: 'none', opacity: 1 }}
      />
    );
  }

  function ManaCostInline({ mana }: { mana: string }){
    const parts = (mana || '').match(/\{[^}]+\}/g) || [];
    return (
      <span className="inline-flex items-center gap-[2px] align-middle">
        {parts.map((p, i) => {
          const sym = p.replace(/[{}]/g,'').toUpperCase();
          if (['W','U','B','R','G'].includes(sym)) return <img key={i} src={`/mana/${sym.toLowerCase()}.svg`} alt={sym} width={14} height={14} style={{ filter:'none' }} />;
          return <span key={i} className="text-[10px] px-[3px] py-[1px] rounded bg-neutral-800 border border-neutral-700">{sym}</span>;
        })}
      </span>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Preferences strip (moved above thread selector) */}
      {extrasOn && (
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
                className={`px-2 py-1 rounded border ${colors[c]?'bg-neutral-900 border-neutral-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'} flex flex-col items-center gap-1`}
                title={`Color identity filter: ${COLOR_LABEL[c]}`}
                aria-label={`Color identity filter: ${COLOR_LABEL[c]}`}
              >
                <span className={`relative inline-flex items-center justify-center rounded-full ${colors[c] ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ' + (c==='W'?'ring-amber-300':c==='U'?'ring-sky-400':c==='B'?'ring-slate-400':c==='R'?'ring-red-400':'ring-emerald-400') : ''}`} style={{ width: 24, height: 24 }}>
                  <ManaIcon c={c as any} active={true} />
                </span>
                <span className="text-[10px] opacity-80">{COLOR_LABEL[c]}</span>
              </button>
            ))}
            <button
              onClick={()=>setColors({W:false,U:false,B:false,R:false,G:false})}
              className="px-3 py-2 rounded border bg-neutral-900 border-neutral-700 hover:bg-neutral-800"
              title="Clear color identity filter"
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
          <div className="flex items-center gap-2">
            <span className="opacity-70">Teaching Mode:</span>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!teaching} onChange={e=>setTeaching(e.target.checked)} />
              <span className="opacity-80">Explain in more detail</span>
            </label>
          </div>
        </div>
      </div>
      )}

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

      {/* Assistant spotlight header */}
      <div className="mt-1 mb-1">
        <div className="text-sm font-semibold opacity-90">Your deck-building assistant</div>
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
            if (obj && obj.type === "deck_scaffold" && obj.data) {
              const d:any = obj.data;
              return (
                <div key={m.id} className="text-right">
                  <div className="inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-emerald-900/30 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2"><span>assistant</span></div>
                    <div className="space-y-2 text-[12px]">
                      <div className="font-semibold">Draft deck ready</div>
                      <div className="opacity-80">{d?.title || 'Draft'} created from your prompt.</div>
                      <a className="inline-block px-3 py-1 rounded bg-emerald-600 text-white" href={d?.url || ('/my-decks/'+String(d?.id||''))}>Open in Builder →</a>
                    </div>
                  </div>
                </div>
              );
            }
            if (obj && obj.type === "helpers" && obj.data) {
              const d:any = obj.data;
              return (
                <div key={m.id} className="text-right">
                  <div className="group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2"><span>assistant</span></div>
                    <div className="space-y-3 text-[12px] opacity-90">
                      {d.nl && (
                        <div>
                          <div className="font-semibold mb-1">Search</div>
                          <details className="mb-1"><summary className="cursor-pointer underline">Query</summary><code className="px-1 py-[1px] rounded bg-neutral-800 border border-neutral-700">{d.nl.scryfall_query}</code></details>
                          <div className="flex flex-wrap gap-2">
                            {(Array.isArray(d.nl.results)?d.nl.results:[]).map((c:any,i:number)=> (
                              <div key={i} className="flex items-center gap-2 border border-neutral-700 rounded px-2 py-1">
                                {c.image && (<img src={c.image} alt={c.name} width={36} height={52} className="rounded" />)}
                                <div>
                                  <div className="font-medium flex items-center gap-2">{c.name} {c.mana_cost && (<ManaCostInline mana={c.mana_cost} />)}</div>
                                  <div className="opacity-70">{c.type_line}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {d.combos && (
                        <div>
                          <div className="font-semibold mb-1">Combos ({d.combos.commander})</div>
                          <ul className="list-disc ml-5">
                            {(Array.isArray(d.combos.combos)?d.combos.combos:[]).map((c:any,i:number)=>(<li key={i}>{c.line}</li>))}
                          </ul>
                        </div>
                      )}
                      {d.combos_detect && (
                        <div>
                          <div className="font-semibold mb-1">Combos detected</div>
                          {Array.isArray(d.combos_detect.present) && d.combos_detect.present.length>0 && (
                            <div className="mb-1">
                              <div className="opacity-80 text-[12px]">Present:</div>
                              <ul className="list-disc ml-5">
                                {d.combos_detect.present.slice(0,5).map((c:any,i:number)=>(
                                  <li key={'p'+i}>
                                    <span className="font-medium">{c.name}</span>
                                    {Array.isArray(c.pieces) && c.pieces.length>0 && (
                                      <span className="opacity-80"> — {c.pieces.join(' + ')}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Array.isArray(d.combos_detect.missing) && d.combos_detect.missing.length>0 && (
                            <div>
                              <div className="opacity-80 text-[12px]">One piece missing:</div>
                              <ul className="list-disc ml-5">
                                {d.combos_detect.missing.slice(0,5).map((c:any,i:number)=>(
                                  <li key={'m'+i}>
                                    <span className="font-medium">{c.name}</span>
                                    {Array.isArray(c.have)&&c.have.length>0 && (
                                      <span className="opacity-80"> — have {c.have.join(' + ')}, need <a className="underline" href={`https://scryfall.com/search?q=${encodeURIComponent('!"'+(c.suggest||'')+'"')}`} target="_blank" rel="noreferrer">{c.suggest}</a></span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {d.rules && (
                        <div>
                          <div className="font-semibold mb-1">Rules references</div>
                          <ul className="list-disc ml-5">
                            {(Array.isArray(d.rules.results)?d.rules.results:[]).slice(0,5).map((r:any,i:number)=>(
                              <li key={i}><span className="font-medium">{r.rule}</span>: {r.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="mt-2"><InlineFeedback msgId={String(m.id)} content={String('helpers')} /></div>
                  </div>
                </div>
              );
            }
            if (obj && obj.type === "pack" && obj.data) {
              const data: any = obj.data;
              const isAssistant = true;
              return (
                <div key={m.id} className="text-right">
                  <div className="group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                      <span>assistant</span>
                    </div>
                    {(() => {
                      const chips: string[] = [];
                      try {
                        // Use current prefs to show an Assumption pill inline (editable via top strip)
                        chips.push(`Format: ${fmt}`);
                        chips.push(`Value: ${budget}`);
                        const sel = Object.entries(colors).filter(([k,v])=>v).map(([k])=>k).join('');
                        chips.push(`Colors: ${sel || 'any'}`);
                      } catch {}
                      return (
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] opacity-80">
                          <span className="px-2 py-[2px] rounded-full border border-blue-700 bg-blue-950/50">{chips.join('  •  ')}</span>
                          <span className="opacity-60">(click buttons above to adjust)</span>
                        </div>
                      );
                    })()}
                    <div className="space-y-2 text-sm">
                      {Array.isArray(data.fast_swaps) && data.fast_swaps.length>0 && (
                        <div>
                          <div className="font-semibold text-[12px] opacity-90">Fast Swaps</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {data.fast_swaps.slice(0,3).map((sw:any,i:number)=>(
                              <div key={i} className="text-[12px] px-2 py-1 rounded border border-neutral-600">
                                {sw.out} → {sw.in}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(data.combos) && data.combos.length>0 && (
                        <div>
                          <div className="font-semibold text-[12px] opacity-90">Combos</div>
                          <ul className="list-disc ml-5 text-[12px]">
                            {data.combos.slice(0,3).map((c:any,i:number)=>(<li key={i}>{c.line}</li>))}
                          </ul>
                        </div>
                      )}
                      {data.curve && (
                        <div className="text-[12px] opacity-90">Curve/Removal: {String(data.curve)}</div>
                      )}
                      {data.rules && (
                        <div className="text-[12px] opacity-90">Rules: {String(data.rules)}</div>
                      )}
                    </div>
                    <div className="mt-2"><InlineFeedback msgId={String(m.id)} content={String(data?.note || '')} /></div>
                  </div>
                </div>
              );
            }
            if (obj && obj.type === "rules" && obj.data) {
              const d:any = obj.data;
              return (
                <div key={m.id} className="text-right">
                  <div className="group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2"><span>assistant</span></div>
                    <div className="text-[12px] opacity-90">
                      <div className="font-semibold mb-1">Rules references</div>
                      <ul className="list-disc ml-5">
                        {(Array.isArray(d.results)?d.results:[]).slice(0,5).map((r:any,i:number)=>(
                          <li key={i}><span className="font-medium">{r.rule}</span>: {r.text}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-2"><InlineFeedback msgId={String(m.id)} content={String((d.results||[]).map((x:any)=>x.rule).join(', '))} /></div>
                  </div>
                </div>
              );
            }
            if (obj && obj.type === "nl_search" && obj.data) {
              const d:any = obj.data;
              const isAssistant = true;
              return (
                <div key={m.id} className="text-right">
                  <div className="group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2"><span>assistant</span></div>
                    <div className="text-[12px] opacity-90">
                      <div className="mb-1">Translated: <code className="px-1 py-[1px] rounded bg-neutral-800 border border-neutral-700">{d?.scryfall_query}</code></div>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(d?.results) ? d.results : []).map((c:any,i:number)=> (
                          <div key={i} className="flex items-center gap-2 border border-neutral-700 rounded px-2 py-1">
                            {c.image && (<img src={c.image} alt={c.name} width={36} height={52} className="rounded" />)}
                            <div className="text-[12px]">
                              <div className="font-medium flex items-center gap-2">{c.name} {c.mana_cost && (<ManaCostInline mana={c.mana_cost} />)}</div>
                              <div className="opacity-70">{c.type_line}</div>
                              <div className="flex gap-2 mt-1">
                                <a className="underline" href={c.scryfall_uri} target="_blank" rel="noreferrer">Scryfall</a>
                                <button className="underline" onClick={async()=>{
                                  if (linkedDeckId) {
                                    await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: c.name, qty: 1 }) });
                                  } else {
                                    const ok = window.confirm('No deck linked. Prefill deck Quick Add?');
                                    if (ok) try { window.dispatchEvent(new CustomEvent('quickadd:prefill', { detail: `add 1 ${c.name}` })); } catch {}
                                  }
                                }}>+ Add</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2"><InlineFeedback msgId={String(m.id)} content={String(d?.scryfall_query || '')} /></div>
                  </div>
                </div>
              );
            }
            if (obj && obj.type === "suggestions" && obj.data) {
              const adds = Array.isArray(obj.data.adds) ? (obj.data.adds as Array<{ name: string; qty?: number; reason?: string }>).slice(0, 12) : [];
              const removes = Array.isArray(obj.data.removes) ? (obj.data.removes as Array<{ name: string; qty?: number; reason?: string }>).slice(0, 12) : [];
              const swaps = Array.isArray(obj.data.swaps) ? (obj.data.swaps as Array<{ out: string; in: string; qty?: number; reason?: string }>).slice(0, 12) : [];
              const isAssistant = true;
              return (
                <div key={m.id} className="text-right">
                  <div className="group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap relative overflow-visible">
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                      <span>assistant</span>
                    </div>
                    {obj.data.note && (<div className="mb-2 text-sm opacity-90">{obj.data.note}</div>)}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      {adds.map((it, i) => (
                        <span key={'addwrap:'+i} className="inline-flex items-center gap-1">
                          <button
                            key={'add:'+ (it.name||'') + ':' + (it.qty||1) + ':' + i}
                            onClick={async ()=>{
                              const name = String(it.name||'').trim(); const qty = Math.max(1, Number(it.qty)||1);
                              if (!name) return;
                              if (linkedDeckId) {
                                try {
                                  const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, qty }) });
                                  const j = await res.json().catch(()=>({}));
                                  if (!res.ok || j?.ok===false) throw new Error(j?.error?.message || 'Add failed');
                                  try { const tc = await import("@/lib/toast-client"); tc.toast(`Added ${qty} × ${name}`, 'success'); } catch {}
                                } catch(e:any) { try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Add failed'); } catch { alert(e?.message || 'Add failed'); } }
                              } else {
                                const ok = window.confirm('No deck is linked to this chat. Prefill the deck page\'s Quick Add instead?');
                                if (ok) { try { window.dispatchEvent(new CustomEvent('quickadd:prefill', { detail: `add ${it.qty||1} ${it.name}` })); } catch {} }
                                try { const tc = await import("@/lib/toast-client"); tc.toast('Tip: Link this chat to a deck to add cards directly.', 'info'); } catch {}
                              }
                            }}
                            className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700"
                          >
                            + Add {(it.qty||1)>1?`${it.qty} `:''}{it.name}
                          </button>
                          {it.reason && (
                            <details className="ml-1 inline-block text-[11px] opacity-80"><summary className="cursor-pointer underline">Why?</summary><div className="mt-1">{it.reason}</div></details>
                          )}
                        </span>
                      ))}
                      {removes.map((it, i) => (
                        <span key={'remwrap:'+i} className="inline-flex items-center gap-1">
                          <button
                            key={'rem:'+ (it.name||'') + ':' + (it.qty||1) + ':' + i}
                            onClick={async ()=>{
                              const name = String(it.name||'').trim(); const qty = Math.max(1, Number(it.qty)||1);
                              if (!name) return;
                              if (!linkedDeckId) { alert('Link this chat to a deck to remove cards.'); return; }
                              try {
                                const gr = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`);
                                const gj = await gr.json().catch(()=>({}));
                                const row = (gj?.cards||[]).find((r:any)=>String(r?.name).toLowerCase()===name.toLowerCase());
                                if (!row?.id) throw new Error('Card not in deck');
                                const pr = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: row.id, delta: -qty }) });
                                const pj = await pr.json().catch(()=>({}));
                                if (!pr.ok || pj?.ok===false) throw new Error(pj?.error || 'Remove failed');
                                try { const tc = await import("@/lib/toast-client"); tc.toast(`Removed ${qty} × ${name}`, 'success'); } catch {}
                              } catch(e:any) { try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Remove failed'); } catch { alert(e?.message || 'Remove failed'); } }
                            }}
                            className="px-2 py-[2px] rounded border border-red-700 text-red-300 hover:bg-red-900/20"
                          >
                            − Remove {(it.qty||1)>1?`${it.qty} `:''}{it.name}
                          </button>
                          {it.reason && (
                            <details className="ml-1 inline-block text-[11px] opacity-80"><summary className="cursor-pointer underline">Why?</summary><div className="mt-1">{it.reason}</div></details>
                          )}
                        </span>
                      ))}
                      {swaps.map((sw, i) => (
                        <span key={'swapwrap:'+i} className="inline-flex items-center gap-1">
                          <button
                            key={'swap:'+ (sw.out||'') + '>' + (sw.in||'') + ':' + i}
                            onClick={async ()=>{
                              const out = String(sw.out||'').trim(); const inn = String(sw.in||'').trim(); const qty = Math.max(1, Number(sw.qty)||1);
                              if (!out || !inn) return;
                              if (!linkedDeckId) { alert('Link this chat to a deck to perform swaps.'); return; }
                              try {
                                // remove out
                                const gr = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`);
                                const gj = await gr.json().catch(()=>({}));
                                const row = (gj?.cards||[]).find((r:any)=>String(r?.name).toLowerCase()===out.toLowerCase());
                                if (row?.id) { await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: row.id, delta: -qty }) }); }
                                // add in
                                await fetch(`/api/decks/cards?deckid=${encodeURIComponent(linkedDeckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: inn, qty }) });
                                try { const tc = await import("@/lib/toast-client"); tc.toast(`Swapped ${qty} × ${out} → ${inn}`, 'success'); } catch {}
                              } catch(e:any) { try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Swap failed'); } catch { alert(e?.message || 'Swap failed'); } }
                            }}
                            className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700"
                          >
                            Swap {(sw.qty||1)>1?`${sw.qty} `:''}{sw.out} → {sw.in}
                          </button>
                          {sw.reason && (
                            <details className="ml-1 inline-block text-[11px] opacity-80"><summary className="cursor-pointer underline">Why?</summary><div className="mt-1">{sw.reason}</div></details>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2"><InlineFeedback msgId={String(m.id)} content={String(obj.data?.note || '')} /></div>
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
                  "group inline-block max-w-[100%] sm:max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
                  (isAssistant ? "bg-blue-900/40" : "bg-neutral-800")
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                  <span>{isAssistant ? 'assistant' : (displayName || 'you')}</span>
                </div>
                <div className="leading-relaxed">{m.content}</div>
                {isAssistant && (
                  <div className="mt-2">
                    <InlineFeedback msgId={String(m.id)} content={String(m.content || '')} />
                  </div>
                )}
                {/* Card image chips (simple detector) */}
                {(() => {
                  const text = String(m.content || '');
                  const rawLines = text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
                  const candidates: string[] = [];
                  for (const l of rawLines) {
                    // Decklist-like: "1 Sol Ring" or "Sol Ring x1"
                    const mm = l.match(/^(?:SB:\s*)?(\d+)\s*[xX]?\s+(.+)$/) || l.match(/^(.+?)\s+[xX]\s*(\d+)$/);
                    if (mm) { const name = (mm[2] || mm[1] || '').trim(); if (name) candidates.push(name); continue; }
                    // "Card:" or "Add:" hints
                    const cm = l.match(/^Card:\s*(.+)$/i); if (cm) { candidates.push(cm[1].trim()); continue; }
                    const am = l.match(/^Add:\s*(?:\d+\s*[xX]?\s+)?(.+)$/i); if (am) { candidates.push(am[1].trim()); continue; }
                    // "show me <card>" pattern — require at least two words to avoid stray matches
                    const sm = l.match(/^(?:show\s+me|show|card|image)\s+([A-Za-z][A-Za-z'\-\s]{1,40})$/i);
                    if (sm) { const name = sm[1].trim(); const wc = name.split(/\s+/).length; if (wc >= 2 && wc <= 6) candidates.push(name); continue; }
                  }
                  const names = Array.from(new Set(candidates)).slice(0, 12);
                  if (names.length === 0) return null;
                  return <CardChips names={names} />;
                })()}
                {extrasOn && isAssistant && (/\bdeck\b|\bswap\b|\bcollection\b|\bowned\b/i.test(String(m.content || ''))) && (
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
      {extrasOn && (isDecklist(text) || /\bcollection\b|\bowned\b|\bmy\s+cards\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Looks like a deck:</span>
          <a className="underline underline-offset-4" href="/collections/cost-to-finish" onClick={() => { try { capture('nudge_cost_to_finish'); } catch {} }}>Run Cost-to-Finish</a>
          <a className="underline underline-offset-4" href="/deck/swap-suggestions" onClick={() => { try { capture('nudge_swaps'); } catch {} }}>Find Budget Swaps</a>
          <a className="underline underline-offset-4" href="#" onClick={() => { setLastDeck(text); saveDeck(); try { capture('nudge_judger'); } catch {} }}>Analyze/Judge</a>
        </div>
      )}

      {/* Nudges: Probability / Mulligan topics */}
      {extrasOn && (/\bprobability\b|\bodds\b|\bchance\b|\bhypergeometric\b|\bdraws?\s+by\s+turn\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Math-y question?</span>
          <a className="underline underline-offset-4" href="/tools/probability" onClick={() => { try { capture('nudge_probability'); } catch {} }}>Open Probability Helpers</a>
        </div>
      )}
      {extrasOn && (/\bmulligan\b|\bkeep\s+hand\b|\blondon\s+mulligan\b/i.test(text)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="opacity-70">Wondering about mulligans?</span>
          <a className="underline underline-offset-4" href="/tools/mulligan" onClick={() => { try { capture('nudge_mulligan'); } catch {} }}>Open Mulligan Simulator</a>
        </div>
      )}

      {/* Suggested prompt chips */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] opacity-90">
        {[
          { label: '“Build me a Commander deck”', text: 'Build me a Commander deck' },
          { label: '“Find budget swaps”', text: 'Find budget swaps' },
          { label: '“Upgrade a precon”', text: 'Upgrade a precon' },
          { label: '“Snapshot my deck”', text: 'Snapshot my deck' },
        ].map((p, i) => (
          <button key={i} onClick={()=>setText(p.text)} className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-800">
            {p.label}
          </button>
        ))}
      </div>

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
