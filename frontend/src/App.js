import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:10000";

const MODES = [
  { value: "default", label: "Default" },
  { value: "rules", label: "Rules Judge" },
  { value: "deck_builder", label: "Deck Builder" },
  { value: "market_analyst", label: "Market Analyst" },
  { value: "tutor", label: "Tutor (Suggestions)" },
];

// --- small helpers ---
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const extractBracketed = (text) => {
  if (!text) return [];
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].trim());
  }
  return uniq(out);
};

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
      const raw = localStorage.getItem("mtg_ai_history_v3");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // live previews while typing (for [[Card Name]])
  const [promptPreviews, setPromptPreviews] = useState([]);
  // cards extracted from the assistant reply
  const [answerCards, setAnswerCards] = useState([]);

  const replyPaneRef = useRef(null);
  const canSend = prompt.trim().length > 0 && !loading;

  useEffect(() => {
    localStorage.setItem("mtg_ai_history_v3", JSON.stringify(history));
  }, [history]);

  // Debounced preview: when user types [[Card Name]], fetch previews
  useEffect(() => {
    const names = extractBracketed(prompt).slice(0, 3);
    if (names.length === 0) {
      setPromptPreviews([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const previews = [];
      for (const n of names) {
        try {
          const res = await fetch(`${API_URL}/search?name=${encodeURIComponent(n)}`);
          const data = await res.json();
          if (data?.ok && data?.data?.ok !== false) {
            previews.push(data.data);
          }
        } catch {
          // ignore per-card errors
        }
      }
      if (!cancelled) setPromptPreviews(previews);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [prompt]);

  // After we get a reply, extract [[Card Name]] and fetch a small grid
  useEffect(() => {
    const names = extractBracketed(reply).slice(0, 8);
    if (names.length === 0) {
      setAnswerCards([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const cards = [];
      for (const n of names) {
        try {
          const res = await fetch(`${API_URL}/search?name=${encodeURIComponent(n)}`);
          const data = await res.json();
          if (data?.ok && data?.data?.ok !== false) cards.push(data.data);
        } catch {
          // ignore
        }
      }
      if (!cancelled) setAnswerCards(cards);
    })();
    return () => {
      cancelled = true;
    };
  }, [reply]);

  async function callAPI() {
    setErr("");
    setUsed(null);
    setLoading(true);
    setReply("");
    setAnswerCards([]);

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
    setPromptPreviews([]);
    setAnswerCards([]);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>MTG AI Assistant</h1>
        <p className="sub">Modes, Scryfall-aware prompts. Use [[Card Name]] to reference cards.</p>
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
              placeholder="Ask a rules question, deck advice, market take, etc. Tip: wrap card names like [[Sol Ring]]"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  if (canSend) callAPI();
                }
              }}
            />
            {/* live previews for [[Card]] */}
            {promptPreviews.length > 0 && (
              <div className="preview-grid">
                {promptPreviews.map((c) => (
                  <div key={c.id} className="preview-card" title={c.name}>
                    {c.image_small ? (
                      <img src={c.image_small} alt={c.name} />
                    ) : (
                      <div className="noimg">{c.name}</div>
                    )}
                    <div className="meta">
                      <div className="name">{c.name}</div>
                      <div className="type">{c.type_line}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline ? (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match?.[1] || "plaintext"}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {reply}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="placeholder">Your answer will appear here.</div>
            )}

            {/* Show a card grid if the model (or you) referenced [[Card]] in the reply */}
            {answerCards.length > 0 && (
              <>
                <h3 className="grid-title">Cards mentioned</h3>
                <div className="card-grid">
                  {answerCards.map((c) => (
                    <a
                      key={c.id}
                      className="card-tile"
                      href={c.scryfall_uri || "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={c.name}
                    >
                      {c.image_small ? (
                        <img src={c.image_small} alt={c.name} />
                      ) : (
                        <div className="noimg">{c.name}</div>
                      )}
                      <div className="tile-caption">
                        <div className="name">{c.name}</div>
                        <div className="type">{c.type_line}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
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
