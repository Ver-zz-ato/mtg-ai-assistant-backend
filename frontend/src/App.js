import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const API = process.env.REACT_APP_API_URL || "https://mtg-ai-assistant-backend.onrender.com";
const SCRYFALL = "https://api.scryfall.com";

// --- Utilities ---------------------------------------------------------------
const parseBrackets = (text) => {
  // returns array of {type:'text'|'card', value:string}
  const parts = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "card", value: m[1] });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
};

async function fetchScryfallImage(cardName) {
  const r = await fetch(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.image_uris?.small || j?.image_uris?.normal || null;
}

async function fxRates() {
  // base USD for simple conversion
  const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=USD,EUR,GBP");
  if (!r.ok) return { USD: 1, EUR: 0.92, GBP: 0.78 };
  const j = await r.json();
  return j.rates;
}

// --- Components --------------------------------------------------------------
function CardInline({ name }) {
  const [src, setSrc] = useState(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let mounted = true;
    fetchScryfallImage(name).then((u) => mounted && setSrc(u));
    return () => (mounted = false);
  }, [name]);
  return (
    <span className="card-inline"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      title={name}
    >
      {name}
      {show && src && (
        <span className="card-pop">
          <img src={src} alt={name} />
        </span>
      )}
    </span>
  );
}

function Markdownish({ text }) {
  // super lightweight: only [[Card]] + newlines
  const lines = String(text || "").split("\n");
  return (
    <div className="md">
      {lines.map((ln, i) => (
        <p key={i}>
          {parseBrackets(ln).map((p, idx) =>
            p.type === "text" ? <span key={idx}>{p.value}</span> : <CardInline key={idx} name={p.value} />
          )}
        </p>
      ))}
    </div>
  );
}

// render a single assistant “deck analysis” message
function DeckAnalysis({ data }) {
  const mana = useMemo(() => ({
    labels: data.manaCurve.map(i => i.label),
    datasets: [{ label: "Count", data: data.manaCurve.map(i => i.value) }]
  }), [data]);

  const colors = useMemo(() => ({
    labels: data.colors.map(i => i.label),
    datasets: [{ label: "Cards", data: data.colors.map(i => i.value) }]
  }), [data]);

  const types = useMemo(() => ({
    labels: data.types.map(i => i.label),
    datasets: [{ label: "Cards", data: data.types.map(i => i.value) }]
  }), [data]);

  return (
    <div className="deck-analysis">
      <div className="da-header">
        <img src={data.commander?.image_small || data.commander?.image_normal} alt={data.commander?.name} />
        <div>
          <h4>{data.commander?.name}</h4>
          {data.illegal_by_color_identity?.length > 0 && (
            <div className="illegal">Illegal by color identity: {data.illegal_by_color_identity.join(", ")}</div>
          )}
        </div>
      </div>
      <div className="da-charts">
        <div className="chart"><h5>Mana Curve</h5><Bar data={mana} /></div>
        <div className="chart"><h5>Colors</h5><Pie data={colors} /></div>
        <div className="chart"><h5>Types</h5><Pie data={types} /></div>
      </div>
      {Array.isArray(data.combos) && data.combos.length > 0 && (
        <div className="combos">
          <h5>Combos</h5>
          <ul>
            {data.combos.map((c, i) => (
              <li key={i}>
                {c.link
                  ? <a href={c.link} target="_blank" rel="noreferrer">{c.name || "Combo"}</a>
                  : (c.name || "Combo")}
                {c.description ? <> — {c.description}</> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Main App ----------------------------------------------------------------
export default function App() {
  const [mode, setMode] = useState("default");
  const [currency, setCurrency] = useState("EUR"); // 3-position
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mtg_msgs") || "[]"); } catch { return []; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [deckCommander, setDeckCommander] = useState("");
  const [deckText, setDeckText] = useState("");
  const listEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("mtg_msgs", JSON.stringify(messages));
    if (listEndRef.current) listEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const cycleCurrency = () => setCurrency(c => (c === "EUR" ? "GBP" : c === "GBP" ? "USD" : "EUR"));

  // ---- Slash commands -------------------------------------------------------
  const trySlashCommand = async (raw) => {
    const trimmed = raw.trim();

    // /deck → open modal
    if (trimmed === "/deck") {
      setDeckModalOpen(true);
      return true;
    }

    // /search <query>
    if (trimmed.startsWith("/search ")) {
      const q = trimmed.slice(8).trim();
      if (!q) return false;
      const r = await fetch(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      const items = (j.data || []).slice(0, 20).map(c =>
        `- [[${c.name}]] — ${c.type_line}${c.scryfall_uri ? `\n  ${c.scryfall_uri}` : ""}`
      ).join("\n");
      pushAssistant(`### Scryfall results for \`${q}\`\n${items || "_No results_"}${j.has_more ? "\n…(more on Scryfall)" : ""}`);
      return true;
    }

    // /price [[Card Name]]
    if (trimmed.startsWith("/price")) {
      const m = trimmed.match(/\[\[([^\]]+)\]\]/);
      const name = m?.[1]?.trim();
      if (!name) {
        pushAssistant("Usage: `/price [[Card Name]]`");
        return true;
      }
      const [cardRes, rates] = await Promise.all([
        fetch(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`).then(r => r.json()),
        fxRates()
      ]);
      const usd = parseFloat(cardRes?.prices?.usd || "0") || 0;
      const eur = parseFloat(cardRes?.prices?.eur || "0") || 0;
      const gbp = usd ? usd * (rates.GBP || 0.78) : (eur ? eur * ((rates.GBP || 0.78) / (rates.EUR || 0.92)) : 0);
      pushAssistant(`**Prices for [[${cardRes?.name || name}]]**\n- USD: $${usd.toFixed(2)}\n- EUR: €${eur.toFixed(2)}\n- GBP: £${gbp.toFixed(2)}`);
      return true;
    }

    return false;
  };

  // ---- Chat send ------------------------------------------------------------
  const pushUser = (content) => setMessages(m => [...m, { role: "user", content }]);
  const pushAssistant = (content) => setMessages(m => [...m, { role: "assistant", content }]);
  const pushAssistantDeck = (payload) => setMessages(m => [...m, { role: "assistant_deck", payload }]);

  const send = async () => {
    const content = input;
    if (!content.trim()) return;

    // slash?
    if (await trySlashCommand(content)) {
      setInput("");
      pushUser(content);
      return;
    }

    pushUser(content);
    setInput("");

    try {
      const r = await fetch(`${API}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content, mode, currency }),
      });
      const j = await r.json();
      if (j.ok) pushAssistant(j.reply || "(no reply)");
      else pushAssistant(`Error: ${j.error || "request failed"}`);
    } catch (e) {
      pushAssistant(`Network error: ${e.message}`);
    }
  };

  const onEnter = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ---- Deck modal submit ----------------------------------------------------
  const submitDeck = async () => {
    const cards = deckText.split("\n").map(s => s.trim()).filter(Boolean);
    if (!deckCommander || cards.length === 0) {
      alert("Commander and at least one card, please.");
      return;
    }
    try {
      const r = await fetch(`${API}/deckcheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: deckCommander, cards }),
      });
      const j = await r.json();
      if (j.ok) {
        pushUser(`/deck (${deckCommander}, ${cards.length} cards)`);
        pushAssistantDeck(j);
      } else {
        pushAssistant(`Deck analysis failed: ${j.error || "unknown error"}`);
      }
    } catch (e) {
      pushAssistant(`Deck analysis error: ${e.message}`);
    } finally {
      setDeckModalOpen(false);
    }
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="brand">MTG AI Assistant</div>
        <div className="controls">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="mode">
            <option value="default">Default</option>
            <option value="rules">Rules</option>
            <option value="deck_builder">Deck Builder</option>
            <option value="market_analyst">Market</option>
            <option value="tutor">Tutor</option>
          </select>
          <div className="currency-switch" onClick={cycleCurrency} title="Click to switch currency">
            {currency}
          </div>
          <button className="history-btn" onClick={() => setDrawerOpen(s => !s)}>
            {drawerOpen ? "Hide History" : "Show History"}
          </button>
        </div>
      </div>

      {/* Drawer */}
      <div className={`drawer ${drawerOpen ? "open" : ""}`}>
        <h4>Chat History</h4>
        <div className="drawer-body">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === "assistant_deck" ? (
                <DeckAnalysis data={m.payload} />
              ) : (
                <Markdownish text={m.content} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat column */}
      <div className="chat">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === "assistant_deck" ? (
                <DeckAnalysis data={m.payload} />
              ) : (
                <Markdownish text={m.content} />
              )}
            </div>
          ))}
          <div ref={listEndRef} />
        </div>

        <div className="composer">
          <textarea
            placeholder="Type here…  (try /deck, /search o:'create a Treasure' cmc<=2, or /price [[Sol Ring]])"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onEnter}
          />
          <button onClick={send}>Send</button>
          <button className="deck-btn" onClick={() => setDeckModalOpen(true)}>/deck</button>
        </div>
      </div>

      {/* Deck Modal */}
      {deckModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Deck Analysis</h3>
              <button className="xbtn" onClick={() => setDeckModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                className="inp"
                placeholder="Commander (e.g., Atraxa, Praetors' Voice)"
                value={deckCommander}
                onChange={(e) => setDeckCommander(e.target.value)}
              />
              <textarea
                className="inp"
                placeholder="One card per line…"
                value={deckText}
                onChange={(e) => setDeckText(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button onClick={submitDeck}>Analyze</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
