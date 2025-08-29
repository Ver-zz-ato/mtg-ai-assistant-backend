// frontend/components/Chat.tsx
"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Paste a deck or ask a rules question." },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send() {
    const clean = text.trim();
    if (!clean || loading) return;

    const withUser = [...messages, { role: "user", content: clean } as Msg];
    setMessages(withUser);
    setText("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: withUser.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = (data?.text as string) || "Sorry — no reply.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Error calling /api/chat." },
      ]);
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
      <div
        ref={scrollerRef}
        className="flex-1 bg-gray-900/60 rounded-xl border border-gray-800 p-4 overflow-y-auto min-h-[60vh]"
      >
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <div
              className={
                m.role === "user"
                  ? "inline-block bg-gray-800 rounded-xl px-4 py-3 whitespace-pre-wrap"
                  : "bg-gray-900 border border-gray-800 rounded-xl p-4 whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-sm text-gray-400">Thinking…</div>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-3 min-h-[56px] focus:outline-none focus:ring-1 focus:ring-yellow-500"
          placeholder="Message MTG Coach…"
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
