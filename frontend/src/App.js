import React, { useState } from "react";
import "./App.css";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function App() {
  const [mode, setMode] = useState("default");
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [history, setHistory] = useState([]);
  const [deckCommander, setDeckCommander] = useState("");
  const [deckCards, setDeckCards] = useState("");
  const [deckResult, setDeckResult] = useState(null);
  const [showHistory, setShowHistory] = useState(true);

  const sendPrompt = async () => {
    if (!input.trim()) return;
    setResponse("Loading...");
    try {
      const res = await fetch(`${API_URL}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input, mode })
      });
      const data = await res.json();
      if (data.ok) {
        setResponse(data.reply);
        setHistory((prev) => [...prev, { role: "user", text: input }, { role: "assistant", text: data.reply }]);
      } else {
        setResponse(`Error: ${data.error}`);
      }
    } catch (err) {
      setResponse(`Error: ${err.message}`);
    }
  };

  const runDeckCheck = async () => {
    if (!deckCommander.trim()) return;
    setDeckResult(null);
    try {
      const cardsArray = deckCards.split("\n").map((c) => c.trim()).filter(Boolean);
      const res = await fetch(`${API_URL}/deckcheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: deckCommander, cards: cardsArray })
      });
      const data = await res.json();
      if (data.ok) {
        setDeckResult(data);
      } else {
        setDeckResult({ error: data.error });
      }
    } catch (err) {
      setDeckResult({ error: err.message });
    }
  };

  const chartData = (items) => ({
    labels: items.map((i) => i.label),
    datasets: [
      {
        label: "Count",
        data: items.map((i) => i.value),
        backgroundColor: ["#FFD700", "#ADFF2F", "#87CEEB", "#FF69B4", "#FFA500", "#BA55D3", "#00CED1"]
      }
    ]
  });

  return (
    <div className="app-container">
      {/* Chat + Controls */}
      <div className="chat-section">
        <h1>MTG AI Assistant</h1>
        <div className="controls">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="default">General</option>
            <option value="rules">Rules Expert</option>
            <option value="deck_builder">Deck Builder</option>
            <option value="market_analyst">Market Analyst</option>
            <option value="tutor">Tutor</option>
          </select>
        </div>

        <textarea
          placeholder="Ask something about MTG..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button onClick={sendPrompt}>Send</button>
        {response && (
          <div className="response">
            <strong>AI:</strong> {response}
          </div>
        )}
      </div>

      {/* Deck Check */}
      <div className="deckcheck-section">
        <h2>Deck Check</h2>
        <input
          type="text"
          placeholder="Commander Name"
          value={deckCommander}
          onChange={(e) => setDeckCommander(e.target.value)}
        />
        <textarea
          placeholder="Enter one card name per line"
          value={deckCards}
          onChange={(e) => setDeckCards(e.target.value)}
        />
        <button onClick={runDeckCheck}>Check Deck</button>

        {deckResult && !deckResult.error && (
          <div className="deck-results">
            <h3>{deckResult.commander.name}</h3>
            <img src={deckResult.commander.image_small} alt="Commander" />
            {deckResult.illegal_by_color_identity.length > 0 && (
              <div className="illegal">
                <strong>Illegal cards by color identity:</strong> {deckResult.illegal_by_color_identity.join(", ")}
              </div>
            )}

            {/* Charts */}
            <div className="charts">
              <div className="chart">
                <h4>Mana Curve</h4>
                <Bar data={chartData(deckResult.manaCurve)} />
              </div>
              <div className="chart">
                <h4>Colors</h4>
                <Pie data={chartData(deckResult.colors)} />
              </div>
              <div className="chart">
                <h4>Card Types</h4>
                <Pie data={chartData(deckResult.types)} />
              </div>
            </div>

            {/* Combos */}
            {deckResult.combos && deckResult.combos.length > 0 && (
              <div className="combos">
                <h4>Detected Combos</h4>
                <ul>
                  {deckResult.combos.map((c, i) => (
                    <li key={i}>
                      <a href={c.link} target="_blank" rel="noreferrer">{c.name}</a> - {c.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {deckResult && deckResult.error && (
          <div className="error">Error: {deckResult.error}</div>
        )}
      </div>

      {/* Chat History Panel */}
      {showHistory && (
        <div className="history-panel">
          <h3>Chat History</h3>
          <button className="toggle-btn" onClick={() => setShowHistory(false)}>Hide</button>
          <ul>
            {history.map((h, i) => (
              <li key={i} className={h.role}>{h.role}: {h.text}</li>
            ))}
          </ul>
        </div>
      )}
      {!showHistory && (
        <button className="toggle-btn show" onClick={() => setShowHistory(true)}>Show History</button>
      )}
    </div>
  );
}
