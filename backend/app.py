# backend/app.py
import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS  # NEW

app = Flask(__name__)
CORS(app)  # allow browser apps to call this API

# OpenAI client (uses OPENAI_API_KEY from env)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
USE_OPENAI = os.getenv("USE_OPENAI", "0").lower() in ("1", "true", "yes", "on")

@app.get("/")
def root():
    return jsonify({
        "ok": True,
        "service": "MTG AI Assistant backend",
        "hint": "POST JSON to /api like {'prompt': 'hello'}"
    })

@app.get("/healthz")
def healthz():
    return "ok", 200

@app.route("/api", methods=["POST"])
def api():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    print(f"🛰 /api hit | prompt={prompt}", flush=True)

    if not USE_OPENAI:
        return jsonify({"ok": True, "echo": prompt})

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt or "Say hello"}],
        )
        return jsonify({"ok": True, "reply": resp.choices[0].message.content})
    except Exception as e:
        print(f"❌ OpenAI error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
