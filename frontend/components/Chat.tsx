"use client";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import { listMessages, postMessage, postMessageStream } from "@/lib/threads";
import { capture } from "@/lib/ph";
import { trackDeckCreationWorkflow } from '@/lib/analytics-workflow';
import type { ChatMessage } from "@/types/chat";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChatErrorFallback, withErrorFallback } from "@/components/ErrorFallbacks";
// Enhanced chat functionality
import { 
  analyzeDeckProblems, 
  generateDeckContext, 
  generateActionChips, 
  generateSourceAttribution,
  formatSourcesText,
  type ActionChip,
  type ChatSource 
} from "@/lib/chat/enhancements";

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

function Chat() {
  // State management
  const [flags, setFlags] = useState<any>(null);
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
  const [displayName, setDisplayName] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [fallbackBanner, setFallbackBanner] = useState<string>("");
  
  const recognitionRef = useRef<any>(null);
  const streamStartTimeRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const COLOR_LABEL: Record<'W'|'U'|'B'|'R'|'G', string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  
  // Auto-scroll to bottom when new messages arrive or when streaming
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Initialize flags and user info
  useEffect(()=>{ 
    (async()=>{ 
      try{ 
        const r = await fetch('/api/config?key=flags', { cache:'no-store' }); 
        const j = await r.json(); 
        if (j?.config?.flags) setFlags(j.config.flags); 
      } catch {} 
    })(); 
  }, []);
  
  useEffect(() => { 
    (async () => { 
      try { 
        const sb = createBrowserSupabaseClient(); 
        const { data } = await sb.auth.getUser(); 
        const u:any = data?.user; 
        const md:any = u?.user_metadata || {}; 
        setDisplayName(String(md.username || u?.email || 'you')); 
      } catch {} 
    })(); 
  }, []);

  const extrasOn = flags ? (flags.chat_extras !== false) : true;

  // Message management functions
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
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); } catch {}
        setThreadId(null);
        return;
      }
      throw e;
    }
  }

  // Thread management
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

  // Deck linking
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

  // Utility functions
  function newChat() {
    setThreadId(null);
    setMessages([]);
    setText("");
    try { 
      if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); 
    } catch {}
    setHistKey(k => k + 1);
  }

  function clearThread() {
    if (process.env.NODE_ENV === 'development') {
      setMessages([]);
      setText("");
      setIsStreaming(false);
      setStreamingContent("");
      if (streamAbort) {
        streamAbort.abort();
        setStreamAbort(null);
      }
    }
  }

  function gotoMyDecks() { 
    window.location.href = "/my-decks"; 
  }

  // Voice input functionality
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser. Please try Chrome or Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        if (finalTranscript) {
          setText(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please enable microphone permissions for this site.');
        } else if (event.error === 'network') {
          alert('Network error during voice recognition. Please check your internet connection.');
        } else if (event.error !== 'no-speech') {
          alert(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  // Main send function
  async function send() {
    if (!text.trim() || busy) return;
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    const val = text;
    const looksDeck = isDecklist(val);
    if (looksDeck) setLastDeck(val);

    setText("");
    setBusy(true);
    setMessages(m => [
      ...m,
      { id: Date.now(), thread_id: threadId || "", role: "user", content: val, created_at: new Date().toISOString() } as any,
    ]);

    // Track analytics
    const streamStartTime = Date.now();
    streamStartTimeRef.current = streamStartTime;
    capture('chat_sent', { 
      chars: (val?.length ?? 0), 
      thread_id: threadId ?? null,
      is_decklist: looksDeck,
      format: fmt,
      budget: budget,
      teaching_mode: teaching
    });

    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k), teaching };
    
    // Build enhanced context with deck-aware problem analysis
    let deckContext = '';
    if (linkedDeckId) {
      try {
        const deckProblems = await analyzeDeckProblems(linkedDeckId);
        if (deckProblems.length > 0) {
          deckContext = generateDeckContext(deckProblems, 'Current Deck');
        }
      } catch (error) {
        console.warn('Failed to generate deck context:', error);
      }
    }
    
    const context: any = { 
      deckId: linkedDeckId || null, 
      budget, 
      colors: prefs.colors, 
      teaching,
      deckContext: deckContext
    };
    
    // Try streaming
    let streamFailed = false;
    const abortController = new AbortController();
    setStreamAbort(abortController);
    setIsStreaming(true);
    setStreamingContent("");
    setFallbackBanner("");

    const streamingMsgId = Date.now() + 1;
    setMessages(m => [
      ...m,
      { 
        id: streamingMsgId, 
        thread_id: threadId || "", 
        role: "assistant", 
        content: "Typing…", 
        created_at: new Date().toISOString() 
      } as any,
    ]);

    try {
      await postMessageStream(
        { text: val, threadId, context, prefs },
        (token: string) => {
          setStreamingContent(prev => {
            const newContent = prev + token;
            setMessages(m => 
              m.map(msg => 
                msg.id === streamingMsgId 
                  ? { ...msg, content: newContent || "Typing…" }
                  : msg
              )
            );
            return newContent;
          });
        },
        () => {
          setIsStreaming(false);
          setStreamAbort(null);
          capture('chat_stream_stop', {
            stopped_by: 'complete',
            duration_ms: Date.now() - streamStartTime,
            tokens_if_known: Math.ceil(streamingContent.length / 4)
          });
        },
        (error: Error) => {
          setIsStreaming(false);
          setStreamAbort(null);
          if (error.message === "fallback") {
            streamFailed = true;
            capture('chat_stream_fallback', { reason: 'fallback_response' });
          } else {
            console.error("Stream error:", error);
            streamFailed = true;
            capture('chat_stream_error', {
              reason: error.message || 'unknown',
              duration_ms: Date.now() - streamStartTime,
              had_partial: streamingContent.length > 0
            });
          }
        },
        abortController.signal
      );
    } catch (error) {
      setIsStreaming(false);
      setStreamAbort(null);
      streamFailed = true;
      capture('chat_stream_error', {
        reason: String(error).substring(0, 100),
        duration_ms: Date.now() - streamStartTime,
        had_partial: streamingContent.length > 0
      });
    }

    let res: any;
    if (streamFailed) {
      setMessages(m => m.filter(msg => msg.id !== streamingMsgId));
      setFallbackBanner("Live streaming temporarily unavailable.");
      res = await postMessage({ text: val, threadId, context }, threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));
    } else {
      res = { ok: true, threadId: threadId };
    }

    let tid = threadId as string | null;
    if ((res as any)?.ok) {
      tid = (res as any).threadId as string;
      if (tid !== threadId) setThreadId(tid);
      setHistKey(k => k + 1);
      await refreshMessages(tid);
    } else {
      const errorMsg = res?.error?.message || "Chat failed";
      try { 
        const tc = await import("@/lib/toast-client");
        tc.toastError(errorMsg);
      } catch {}
      
      setMessages(m => [
        ...m,
        { id: Date.now() + 1, thread_id: threadId || "", role: "assistant", content: `I encountered an error: ${errorMsg}. Please try asking again.`, created_at: new Date().toISOString() } as any,
      ]);
    }

    setBusy(false);
  }

  // Render helper components
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

  function ManaIcon({ c, active }: { c: 'W'|'U'|'B'|'R'|'G'; active: boolean }){
    const srcCdn = c==='W' ? 'https://svgs.scryfall.io/card-symbols/w.svg'
      : c==='U' ? 'https://svgs.scryfall.io/card-symbols/u.svg'
      : c==='B' ? 'https://svgs.scryfall.io/card-symbols/b.svg'
      : c==='R' ? 'https://svgs.scryfall.io/card-symbols/r.svg'
      : 'https://svgs.scryfall.io/card-symbols/g.svg';
    
    return (
      <img
        src={srcCdn}
        alt={`${COLOR_LABEL[c]} mana`}
        width={16}
        height={16}
        style={{ filter: 'none', opacity: 1 }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Mobile-optimized Header */}
      <div className="bg-neutral-900 p-3 sm:p-4 border-b border-neutral-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold">MTG Assistant</h1>
            {!threadId && (
              <span className="text-xs px-2 py-1 bg-neutral-800 rounded-full text-neutral-400">
                New Chat
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {process.env.NODE_ENV === "development" && (
              <button
                onClick={clearThread}
                className="px-2 py-1 sm:px-3 text-xs bg-red-600 text-white rounded hover:bg-red-700 touch-manipulation"
                data-testid="clear-thread"
              >
                Clear
              </button>
            )}
            <button
              onClick={newChat}
              className="px-2 py-1 sm:px-3 text-xs bg-neutral-700 text-white rounded hover:bg-neutral-600 touch-manipulation"
              data-testid="new-chat"
            >
              New Chat
            </button>
          </div>
        </div>
      </div>
      
      {/* Collapsible preferences and thread selector for mobile */}
      <div className="p-2 sm:p-4 space-y-3 border-b border-neutral-800 flex-shrink-0">
        {/* Preferences strip */}
        {extrasOn && (
          <div className="w-full border border-neutral-800 bg-neutral-900/60 rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-sm sm:text-base">
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Format:</span>
                {(['commander','standard','modern'] as const).map(f => (
                  <button
                    key={f}
                    onClick={()=>setFmt(f)}
                    className={`px-2 py-1 sm:px-3 sm:py-2 rounded border touch-manipulation text-xs sm:text-sm ${fmt===f?'bg-blue-700 text-white border-blue-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{f}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Colors:</span>
                {(['W','U','B','R','G'] as const).map(c => (
                  <button
                    key={c}
                    onClick={()=>setColors(s=>({...s,[c]:!s[c]}))}
                    className={`px-1 py-1 sm:px-2 sm:py-1 rounded border touch-manipulation ${colors[c]?'bg-neutral-900 border-neutral-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'} flex flex-col items-center gap-1`}
                    title={`Color identity filter: ${COLOR_LABEL[c]}`}
                    aria-label={`Color identity filter: ${COLOR_LABEL[c]}`}
                  >
                    <span className={`relative inline-flex items-center justify-center rounded-full ${colors[c] ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ' + (c==='W'?'ring-amber-300':c==='U'?'ring-sky-400':c==='B'?'ring-slate-400':c==='R'?'ring-red-400':'ring-emerald-400') : ''}`} style={{ width: 20, height: 20 }}>
                      <ManaIcon c={c as any} active={true} />
                    </span>
                    <span className="text-[8px] sm:text-[10px] opacity-80">{COLOR_LABEL[c]}</span>
                  </button>
                ))}
                <button
                  onClick={()=>setColors({W:false,U:false,B:false,R:false,G:false})}
                  className="px-2 py-1 sm:px-3 sm:py-2 rounded border bg-neutral-900 border-neutral-700 hover:bg-neutral-800 touch-manipulation text-xs sm:text-sm"
                  title="Clear color identity filter"
                >Clear</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Value:</span>
                {(['budget','optimized','luxury'] as const).map(b => (
                  <button
                    key={b}
                    onClick={()=>setBudget(b)}
                    className={`px-2 py-1 sm:px-3 sm:py-2 rounded border touch-manipulation text-xs sm:text-sm ${budget===b?'bg-emerald-700 text-white border-emerald-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{b}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Teaching:</span>
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm touch-manipulation">
                  <input type="checkbox" checked={!!teaching} onChange={e=>setTeaching(e.target.checked)} className="touch-manipulation" />
                  <span className="opacity-80">Explain in more detail</span>
                </label>
              </div>
            </div>
          </div>
        )}
        
        {/* Thread selector */}
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
        <div className="">
          <div className="text-sm font-semibold opacity-90">Your deck-building assistant</div>
        </div>
      </div>
      
      {/* Messages area - flexible with scrolling */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {fallbackBanner && (
          <div className="mb-2 px-3 py-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-sm flex-shrink-0">
            {fallbackBanner}
          </div>
        )}
        
        <div className="flex-1 space-y-3 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded p-3 overflow-y-auto overscroll-behavior-y-contain">
          {/* Messages with streaming content */}
          {(!Array.isArray(messages) || messages.length === 0) ? (
            <div className="text-neutral-400">Start a new chat or pick a thread above.</div>
          ) : messages.map((m) => {
            const isAssistant = m.role === "assistant";
            return (
              <div key={m.id} className={isAssistant ? "text-right" : "text-left"}>
                <div
                  className={
                    "group inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
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
                </div>
              </div>
            );
          })}
          
          {/* Show streaming content */}
          {isStreaming && streamingContent && (
            <div className="text-right">
              <div className="inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap">
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                  <span>assistant</span>
                  <span className="ml-2 animate-pulse">•••</span>
                </div>
                <div className="leading-relaxed">{streamingContent}</div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor for auto-scroll */}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>
      
      {/* Mobile-optimized input area - sticky at bottom */}
      <div className="p-3 sm:p-4 border-t border-neutral-800 bg-black flex-shrink-0">
        {/* Suggested prompt chips */}
        <div className="mb-3 flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] opacity-90">
          {[
            { label: '"Build me a Commander deck"', text: 'Build me a Commander deck' },
            { label: '"Find budget swaps"', text: 'Find budget swaps' },
            { label: '"Upgrade a precon"', text: 'Upgrade a precon' },
            { label: '"Snapshot my deck"', text: 'Snapshot my deck' },
          ].map((p, i) => (
            <button 
              key={i} 
              onClick={()=>setText(p.text)} 
              className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-800 touch-manipulation"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
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
              className="w-full bg-neutral-900 text-white border border-neutral-700 rounded-lg px-4 py-3 pr-12 resize-none min-h-[80px] text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              style={{
                WebkitAppearance: 'none',
                fontSize: '16px' // Prevents zoom on iOS
              }}
            />
            {/* Mobile-optimized voice input button - positioned inside textarea */}
            <button 
              onClick={toggleVoiceInput} 
              className={`absolute right-2 top-2 p-2 rounded-full border text-white transition-all touch-manipulation ${
                isListening 
                  ? 'bg-red-600 border-red-500 animate-pulse scale-110' 
                  : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600 active:scale-95'
              } sm:hidden`}
              title={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>
          
          {/* Desktop voice input and send buttons */}
          <div className="hidden sm:flex gap-2 sm:flex-col justify-center sm:justify-start">
            <button 
              onClick={toggleVoiceInput} 
              className={`px-3 py-2 h-fit rounded border text-white transition-colors ${
                isListening 
                  ? 'bg-red-600 border-red-500 animate-pulse' 
                  : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600'
              }`}
              title={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            {isStreaming ? (
              <button 
                onClick={() => {
                  if (streamAbort) {
                    streamAbort.abort();
                    setStreamAbort(null);
                    setIsStreaming(false);
                    capture('chat_stream_stop', {
                      stopped_by: 'user',
                      duration_ms: Date.now() - streamStartTimeRef.current,
                      tokens_if_known: Math.ceil(streamingContent.length / 4)
                    });
                  }
                }} 
                className="px-4 py-2 h-fit rounded bg-red-600 text-white hover:bg-red-700"
              >
                Stop
              </button>
            ) : (
              <button onClick={send} disabled={busy || !text.trim()} className="px-4 py-2 h-fit rounded bg-blue-600 text-white disabled:opacity-60" data-testid="chat-send">
                {busy ? "…" : "Send"}
              </button>
            )}
          </div>
          
          {/* Mobile send button - full width */}
          <div className="sm:hidden">
            {isStreaming ? (
              <button 
                onClick={() => {
                  if (streamAbort) {
                    streamAbort.abort();
                    setStreamAbort(null);
                    setIsStreaming(false);
                    capture('chat_stream_stop', {
                      stopped_by: 'user',
                      duration_ms: Date.now() - streamStartTimeRef.current,
                      tokens_if_known: Math.ceil(streamingContent.length / 4)
                    });
                  }
                }} 
                className="w-full py-4 rounded-lg bg-red-600 text-white text-lg font-medium hover:bg-red-700 active:bg-red-800 transition-all touch-manipulation"
              >
                Stop Generation
              </button>
            ) : (
              <button 
                onClick={send} 
                disabled={busy || !text.trim()} 
                className="w-full py-4 rounded-lg bg-blue-600 text-white text-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-all touch-manipulation" 
                data-testid="chat-send"
              >
                {busy ? "Thinking..." : "Send Message"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export Chat component wrapped with error boundary
export default withErrorFallback(Chat, ChatErrorFallback);