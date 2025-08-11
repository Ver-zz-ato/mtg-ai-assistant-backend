import React, { useEffect, useRef, useState } from "react";
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
  const [mode, setMode] = useState("default");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [used, setUsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("mtg_ai_history_v2");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("mtg_ai_history_v2", JSON.stringify(history));
  }, [history]);

  const replyPaneRef = useRef(null);
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
          // sticky context: last 4 messages
          context: history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setReply(data.reply || "");
      setUsed(data.used || null);

      // append to history (user + assistant)
      const newHistory = [
        ...history,
        { role: "user", content: prompt.trim() },
        { role: "assistant", content: data.reply || "" },
      ];
      setHistory(newHistory);
      setPrompt("");

      setTimeout(() => {
        replyPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
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
        <p className="sub">Modes, Scryfall-aware prompts. Clean chat.</p>
      </header>

      {/* Top controls */}
      <div className="topbar">
        <div className="mode-select">
          <label htmlFor="mode">Mode</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <button className="history-toggle" onClick={() => setSidebarOpen((v) => !v)}>
          {sidebarOpen ? "Hide History" : "Show History"}
        </button>
      </div>

      {/* Main layout */}
      <div className="layout">
        {/* Main column */}
        <main className="main">
          <section className="panel">
            <label htmlFor="prompt" className="sr-only">Message</label>
            <textarea
              id="prompt"
              className="chatbox"
              placeholder="Ask a rules question, deck advice, market take, etc."
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  if (canSend) callAPI();
                }
              }}
            />
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

          <footer className="footer">
            <span>Backend: {API_URL}</span>
          </footer>
        </main>

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="panel sidebar-inner">
            <h2>Chat History</h2>
            {history.length === 0 ? (
              <div className="placeholder">No messages yet.</div>
            ) : (
              <div className="history">
                {history.map((m, i) => (
                  <div key={i} className={`bubble ${m.role}`}>
                    <div className="role">{m.role}</div>
                    <div className="content">
                      {m.role === "assistant" ? (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
