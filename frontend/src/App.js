import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:10000";

const MODES = [
  { value: "default", label: "Default" },
  { value: "rules", label: "Rules Judge" },
  { value: "deck_builder", label: "Deck Builder" },
  { value: "market_analyst", label: "Market Analyst" },
  { value: "tutor", label: "Tutor (Suggestions)" },
];

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("default");
  const [cardsText, setCardsText] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [reply, setReply] = useState("");
  const [used, setUsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("mtg_ai_history_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const replyPaneRef = useRef(null);

  // persist history (simple localStorage chat log)
  useEffect(() => {
    localStorage.setItem("mtg_ai_history_v1", JSON.stringify(history));
  }, [history]);

  const cardsArray = useMemo(() => {
    return cardsText
      .split(/[\n,]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 25);
  }, [cardsText]);

  const canSend = prompt.trim().length > 0 && !loading;

  async function callAPI() {
    setErr("");
    setUsed(null);
    setLoading(true);
    setReply("");

    try {
      const res = await fetch(`${API_URL}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mode,
          temperature: Number(temperature),
          // You can pass max_tokens/top_p if you want:
          // max_tokens: 800,
          // top_p: 1,
          cards: cardsArray,
          // simple sticky context: last two turns from history
          context: history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setReply(data.reply || "");
      setUsed(data.used || null);

      // append to history (user + assistant)
      const newHistory = [
        ...history,
        { role: "user", content: prompt.trim() + (cardsArray.length ? `\n\n[Cards: ${cardsArray.join(", ")}]` : "") },
        { role: "assistant", content: data.reply || "" },
      ];
      setHistory(newHistory);
      setPrompt("");

      // scroll reply into view
      setTimeout(() => {
        replyPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      setErr(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setHistory([]);
    setReply("");
    setUsed(null);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>MTG AI Assistant</h1>
        <p className="sub">Modes, Scryfall-aware prompts, Markdown replies.</p>
      </header>

      <section className="panel">
        <div className="row">
          <label htmlFor="mode">Mode</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <label htmlFor="temperature">Temperature: {Number(temperature).toFixed(2)}</label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </div>

        <div className="row">
          <label htmlFor="cards">Card names (comma or newline separated)</label>
          <textarea
            id="cards"
            placeholder="e.g. Sol Ring, Smothering Tithe\n(optional)"
            value={cardsText}
            onChange={(e) => setCardsText(e.target.value)}
            rows={3}
          />
          {cardsArray.length > 0 && (
            <div className="hint">
              Will include {cardsArray.length} card{cardsArray.length > 1 ? "s" : ""} via Scryfall.
            </div>
          )}
        </div>

        <div className="row">
          <label htmlFor="prompt">Your question / instruction</label>
          <textarea
            id="prompt"
            placeholder="Ask a rules question, deck advice, market take, etc."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        </div>

        <div className="actions">
          <button disabled={!canSend} onClick={callAPI}>
            {loading ? "Thinking…" : "Ask"}
          </button>
          <button className="secondary" onClick={clearHistory} disabled={loading}>
            Clear History
          </button>
        </div>

        {err && <div className="error">Error: {err}</div>}
      </section>

      <section ref={replyPaneRef} className="panel">
        <h2>Answer</h2>
        {reply ? (
          <div className="markdown">
            <ReactMarkdown>{reply}</ReactMarkdown>
          </div>
        ) : (
          <div className="placeholder">Your answer will appear here.</div>
        )}
        {used && (
          <details className="used">
            <summary>Details (from backend)</summary>
            <pre>{JSON.stringify(used, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="panel">
        <h2>Chat History (local)</h2>
        {history.length === 0 ? (
          <div className="placeholder">No messages yet.</div>
        ) : (
          <div className="history">
            {history.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <div className="role">{m.role}</div>
                <div className="content">
                  {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Backend: {API_URL}</span>
      </footer>
    </div>
  );
}
