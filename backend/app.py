# backend/app.py
import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow browser apps to call this API

# env + OpenAI client
RAW_USE_OPENAI = os.getenv("USE_OPENAI", "0")
USE_OPENAI = RAW_USE_OPENAI.lower() in ("1", "true", "yes", "on")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# log mode at startup
print(f"🚦 USE_OPENAI={USE_OPENAI} (raw='{RAW_USE_OPENAI}')", flush=True)

@app.get("/")
def root():
    return jsonify({
        "ok": True,
        "service": "MTG AI Assistant backend",
        "mode": "openai" if USE_OPENAI else "echo",
        "hint": "POST JSON to /api like {'prompt': 'hello'}"
    })

@app.get("/healthz")
def healthz():
    return "ok", 200

# safe debug (does NOT print your key)
@app.get("/debug")
def debug():
    has_key = bool(os.getenv("OPENAI_API_KEY"))
    return jsonify({"use_openai": USE_OPENAI, "has_openai_key": has_key})

@app.route("/api", methods=["POST"])
def api():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    print(f"🛰 /api hit | prompt={prompt} | USE_OPENAI={USE_OPENAI}", flush=True)

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
