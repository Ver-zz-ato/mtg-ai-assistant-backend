import React, { useState } from "react";
import "./App.css";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { Pie, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const API_BASE = process.env.REACT_APP_API_BASE || "https://mtg-ai-assistant-backend.onrender.com";

function App() {
  const [mode, setMode] = useState("default");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [deckData, setDeckData] = useState(null);
  const [commander, setCommander] = useState("");
  const [deckList, setDeckList] = useState("");

  const sendPrompt = async () => {
    const res = await fetch(`${API_BASE}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode })
    });
    const data = await res.json();
    if (data.ok) {
      setResponse(data.reply);
      setChatHistory((prev) => [...prev, { role: "user", content: prompt }, { role: "assistant", content: data.reply }]);
    }
  };

  const runDeckCheck = async () => {
    const cards = deckList.split("\n").map((c) => c.trim()).filter((c) => c);
    const res = await fetch(`${API_BASE}/deckcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commander, cards })
    });
    const data = await res.json();
    if (data.ok) setDeckData(data);
  };

  const chartData = (labels, dataset) => ({
    labels,
    datasets: [
      {
        label: "",
        data: Object.values(dataset),
        backgroundColor: ["#FFD700", "#4ADE80", "#60A5FA", "#F472B6", "#A78BFA", "#FACC15", "#94A3B8", "#FB923C"]
      }
    ]
  });

  return (
    <div className="app">
      {showHistory && (
        <div className="history-panel">
          <h3>Chat History</h3>
          {chatHistory.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <b>{m.role === "user" ? "You" : "AI"}:</b> {m.content}
            </div>
          ))}
        </div>
      )}

      <div className="main">
        <button className="toggle-history" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? "Hide History" : "Show History"}
        </button>

        <h1>MTG AI Assistant</h1>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="default">Default</option>
          <option value="rules">Rules Q&A</option>
          <option value="deck_builder">Deck Builder</option>
          <option value="market_analyst">Market Analyst</option>
          <option value="tutor">Tutor / Advice</option>
        </select>

        <div className="currency-toggle">
          {["USD", "EUR", "GBP"].map((cur) => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              className={currency === cur ? "active" : ""}
            >
              {cur}
            </button>
          ))}
        </div>

        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type your question here..." />
        <button onClick={sendPrompt}>Send</button>

        {response && (
          <div className="response">
            <pre>{response}</pre>
          </div>
        )}

        <hr />
        <h2>Deck Check</h2>
        <input value={commander} onChange={(e) => setCommander(e.target.value)} placeholder="Commander Name" />
        <textarea value={deckList} onChange={(e) => setDeckList(e.target.value)} placeholder="One card per line..." />
        <button onClick={runDeckCheck}>Check Deck</button>

        {deckData && (
          <div className="deck-results">
            <h3>{deckData.commander.name}</h3>
            <img src={deckData.commander.image_uris?.normal} alt={deckData.commander.name} width="200" />
            {deckData.illegal_by_color_identity.length > 0 && (
              <p style={{ color: "red" }}>Illegal by Color Identity: {deckData.illegal_by_color_identity.join(", ")}</p>
            )}

            <div className="charts">
              <div className="chart">
                <h4>Mana Curve</h4>
                <Bar data={chartData(Object.keys(deckData.mana_curve), deckData.mana_curve)} />
              </div>
              <div className="chart">
                <h4>Color Breakdown</h4>
                <Pie data={chartData(Object.keys(deckData.color_breakdown), deckData.color_breakdown)} />
              </div>
              <div className="chart">
                <h4>Type Breakdown</h4>
                <Pie data={chartData(Object.keys(deckData.type_breakdown), deckData.type_breakdown)} />
              </div>
            </div>

            {deckData.combos.length > 0 && (
              <div className="combos">
                <h4>Combos Found</h4>
                <ul>
                  {deckData.combos.map((combo, i) => (
                    <li key={i}>{combo.name || "Unnamed Combo"}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
