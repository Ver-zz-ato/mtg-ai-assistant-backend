// frontend/src/App.js
import React, { useState } from "react";
import "./App.css";

// Use env var in prod, fall back to your Render URL if not set (handy for local)
const API_BASE =
  process.env.REACT_APP_API_URL ||
  "https://mtg-ai-assistant-backend.onrender.com";

function App() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [battleLog, setBattleLog] = useState([]);
  const [memory, setMemory] = useState([]);

  const sendPrompt = async (customPrompt) => {
    const finalPrompt = (customPrompt || prompt || "").trim();
    if (!finalPrompt) return;

    try {
      setResponse("Thinking…");

      // Your backend route is POST /api (not /api/generate)
      const res = await fetch(`${API_BASE}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt }),
      });

      const data = await res.json();

      // Backend returns { ok: true, reply: "..."} when USE_OPENAI=1
      // or { ok: true, echo: "..."} in echo mode
      const text = data.reply ?? data.echo ?? data.response;

      if (text) {
        setResponse(text);
        setBattleLog((prev) => [
          ...prev,
          { prompt: finalPrompt, response: text },
        ]);
        setMemory((prev) => [...prev, finalPrompt]);
      } else {
        setResponse("Error: No response from server.");
      }
    } catch (error) {
      setResponse("Error connecting to backend.");
    }
  };

  const handleInjectDecklist = () => {
    const decklist =
      "Injecting example decklist: 1x Sol Ring, 1x Command Tower, ...";
    sendPrompt(decklist);
  };

  const handleClearMemory = () => {
    setMemory([]);
    setBattleLog([]);
    setResponse("");
  };

  return (
    <div
      className="app-container"
      style={{
        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "auto",
          padding: "20px",
          backgroundColor: "rgba(0,0,0,0.8)",
          borderRadius: "10px",
          border: "2px solid gold",
        }}
      >
        <h1 style={{ fontWeight: "bold", color: "gold" }}>MTG AI Assistant</h1>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask your question..."
          style={{
            width: "100%",
            height: "100px",
            padding: "10px",
            borderRadius: "5px",
            border: "none",
            marginBottom: "10px",
            backgroundColor: "#222",
            color: "white",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              // Ctrl/Cmd+Enter to send
              sendPrompt();
            }
          }}
        />

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => sendPrompt()}
            style={{
              backgroundColor: "purple",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Ask
          </button>

          <button
            onClick={handleInjectDecklist}
            style={{
              backgroundColor: "blueviolet",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Inject Decklist
          </button>

          <button
            onClick={handleClearMemory}
            style={{
              backgroundColor: "red",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Clear Memory
          </button>

          <button
            onClick={() => alert(JSON.stringify(battleLog, null, 2))}
            style={{
              backgroundColor: "mediumseagreen",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Show Battle Log
          </button>
        </div>

        {response && (
          <div
            style={{
              marginTop: "20px",
              padding: "10px",
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "5px",
              textAlign: "left",
              whiteSpace: "pre-wrap",
            }}
          >
            {response}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
