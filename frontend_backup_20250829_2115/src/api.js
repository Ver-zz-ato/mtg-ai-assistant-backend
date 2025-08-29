// frontend/src/api.js
const API = process.env.REACT_APP_API_URL || "https://mtg-ai-assistant-backend.onrender.com";

export async function ask(prompt) {
  const res = await fetch(`${API}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  const data = await res.json();
  return data.reply ?? data.echo ?? JSON.stringify(data);
}
