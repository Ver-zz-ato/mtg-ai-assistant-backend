"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "./PrefsContext";
import DeckHealthCard from "./DeckHealthCard";
import PriceCard, { PriceItem } from "./PriceCard";
import HistoryDropdown from "./HistoryDropdown";

type TextMsg = { role: "user" | "assistant"; type: "text"; content: string };

type SnapshotMsg = {
  role: "assistant";
  type: "snapshot";
  data: {
    score: number;
    note: string;
    bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
    whatsGood: string[];
    quickFixes: string[];
    illegalByCI?: number;
    illegalExamples?: string[];
    curveBuckets?: number[];
    deckText?: string;
  };
};

type PriceMsg = { role: "assistant"; type: "price"; items: PriceItem[] };
type Msg = TextMsg | SnapshotMsg | PriceMsg;

export default function Chat() {
  const { mode, format, plan, colors, currency } = usePrefs();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", type: "text", content: "Hi! Paste a decklist or ask any MTG question." },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function isProbablyDecklist(s: string): boolean {
    const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 5) return false;
    const hints = ["Island","Swamp","Plains","Forest","Mountain","Sol Ring","Arcane Signet","Swords","Cultivate"," x "];
    const matches = lines.filter((l) => (/^\d+\s*x?\s+/.test(l)) || hints.some((h) => l.toLowerCase().includes(h.toLowerCase()))).length;
    return matches >= 3;
  }

  async function analyzeDeck(deckText: string) {
    const res = await fetch("/api/deck/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckText, format, plan, colors, currency, useScryfall: true }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SnapshotMsg["data"];
  }

  function parsePriceNames(raw: string): string[] {
    const bracketed = Array.from(raw.matchAll(/\[\[(.+?)\]\]/g)).map((m) => m[1].trim());
    if (bracketed.length) return bracketed;
    const after = raw.replace(/^\/price\s*/i, "");
    return after.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function fetchPrices(names: string[]): Promise<PriceItem[]> {
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, currency }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json?.results ?? []) as PriceItem[];
  }

  async function saveDeck(deckText: string) {
    const title = window.prompt("Deck title?", "Untitled Deck");
    if (title === null) return; // cancelled

    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, deckText, format, plan, colors, currency, is_public: true }),
      });

      const rawText = await res.text().catch(() => "");
      let json: any = {};
      try { json = rawText ? JSON.parse(rawText) : {}; } catch { /* keep raw */ }

      // Always surface what happened; avoid ?? with || precedence issues
      if (!res.ok || json?.ok === false) {
        const errMsg = (json && (json.error ?? "")) || rawText || "Unknown error";
        alert(`Save failed (HTTP ${res.status}).\n${errMsg}`);
        return;
      }

      const id: string | undefined = json.id;
      if (id) {
        const go = window.confirm("Saved! Open the deck page now?");
        if (go) window.location.href = `/decks/${encodeURIComponent(id)}`;
      } else {
        alert("Saved! You can find it on the My Decks page.");
      }
    } catch (e: any) {
      alert(String(e?.message ?? e) || "Failed to save deck.");
    }
  }

  async function loadThreadMessages(id: string) {
  try {
    const res = await fetch("/api/chat/messages/list?threadId=" + encodeURIComponent(id), { cache: "no-store" });
    const json = await res.json();
    if (json?.ok) {
      const restored = (json.messages || []).map((m: any) => ({
        role: m.role,
        type: "text",
        content: m.content,
      }));
      setMessages(restored.length ? restored : [{ role: "assistant", type: "text", content: "No messages in this thread yet." }]);
    }
  } catch {
    // ignore
  }
}

async function send() {
    const clean = text.trim();
    if (!clean || loading) return;

    setMessages((m) => [...m, { role: "user", type: "text", content: clean }]);
    setText("");
    setLoading(true);

    try {
      if (clean.toLowerCase().startsWith("/price")) {
        const names = parsePriceNames(clean);
        if (names.length === 0) {
          setMessages((m) => [...m, { role: "assistant", type: "text", content: "Usage: /price [[Card Name]], [[Another Card]] (or comma separated)." }]);
        } else {
          const items = await fetchPrices(names);
          setMessages((m) => [...m, { role: "assistant", type: "price", items }]);
        }
      } else if (clean.startsWith("/analyze") || isProbablyDecklist(clean)) {
        const deckText = clean.replace(/^\/analyze\s*/i, "");
        const data = await analyzeDeck(deckText);
        setMessages((m) => [...m, { role: "assistant", type: "snapshot", data: { ...data, deckText } }]);
      } else {
        const system = [
          "You are MTG Coach. Be concise. Cite CR numbers for rules.",
          `User preferences: mode=${mode}, format=${format}, plan=${plan}, colors=${colors.join("") || "any"}, currency=${currency}.`,
          "Respect format; prefer budget when plan=Budget; use chosen currency in any price references.",
        ].join(" ");

        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system, threadId, 
            messages: [...messages, { role: "user", type: "text", content: clean }]
              .filter((m): m is TextMsg => m.type === "text")
              .map((m) => ({ role: m.role, content: m.content })),
           }), });
        const data = await res.json();
        if (data?.threadId && !threadId) setThreadId(data.threadId);
        const reply = (data?.text as string) || "Sorry — no reply.";
        setMessages((m) => [...m, { role: "assistant", type: "text", content: reply }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", type: "text", content: "Error processing your request." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
  <HistoryDropdown threadId={threadId} onSelect={(id) => { setThreadId(id || null); if (id) loadThreadMessages(id); else setMessages([{ role: "assistant", type: "text", content: "Hi! Paste a decklist or ask any MTG question." }]); }} />
</div>
<div ref={scrollerRef} className="flex-1 bg-gray-900/60 rounded-xl border border-gray-800 p-4 overflow-y-auto min-h-[60vh]">
        {messages.map((m, i) => {
          if (m.type === "text") {
            return (
              <div key={i} className="mb-3">
                <div className={m.role === "user" ? "inline-block bg-gray-800 rounded-xl px-4 py-3 whitespace-pre-wrap" : "bg-gray-900 border border-gray-800 rounded-xl p-4 whitespace-pre-wrap"}>
                  {m.content}
                </div>
              </div>
            );
          }
          if (m.type === "snapshot") {
            return (
              <div key={i} className="mb-3">
                <DeckHealthCard
                  score={m.data.score}
                  note={m.data.note}
                  bands={m.data.bands}
                  whatsGood={m.data.whatsGood}
                  quickFixes={m.data.quickFixes}
                  illegalByCI={m.data.illegalByCI ?? 0}
                  illegalExamples={m.data.illegalExamples ?? []}
                  curveBuckets={m.data.curveBuckets}
                />
                <div className="mt-2 flex gap-2">
                  <button className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm" onClick={() => m.data.deckText && saveDeck(m.data.deckText)}>
                    Save deck
                  </button>
                  <a href="/my-decks" className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm">
                    My Decks →
                  </a>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="mb-3 grid gap-3">
              {m.items.map((item, idx) => (
                <PriceCard key={idx} item={item} highlight={currency} />
              ))}
            </div>
          );
        })}
        {loading && <div className="text-sm text-gray-400">Thinking…</div>}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-3 min-h-[56px] focus:outline-none focus:ring-1 focus:ring-yellow-500"
          placeholder="Ask anything or paste a decklist…"
        />
        <button
          onClick={send}
          disabled={loading || !text.trim()}
          className="h-[56px] px-5 rounded-xl bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
    </>
  );
}
