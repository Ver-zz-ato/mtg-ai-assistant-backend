# backend/app.py
import os
from flask import Flask, request, jsonify
from openai import OpenAI

# --- App setup ---
app = Flask(__name__)

# Optional: enable CORS if your frontend will call this directly from a browser.
# 1) add "flask-cors" to requirements.txt
# 2) uncomment the two lines below
# from flask_cors import CORS
# CORS(app)

# OpenAI client (uses OPENAI_API_KEY from environment)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
USE_OPENAI = os.getenv("USE_OPENAI", "0").lower() in ("1", "true", "yes", "on")


# --- Simple homepage so root URL isn't 404 ---
@app.get("/")
def root():
    return jsonify({
        "ok": True,
        "service": "MTG AI Assistant backend",
        "hint": "POST JSON to /api like {'prompt': 'hello'}"
    })


# --- Lightweight health check for Render ---
@app.get("/healthz")
def healthz():
    return "ok", 200


# --- Main API ---
@app.route("/api", methods=["POST"])
def api():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    print(f"🛰 /api hit | prompt={prompt}", flush=True)

    # Echo mode (safe for infra testing)
    if not USE_OPENAI:
        return jsonify({"ok": True, "echo": prompt})

    # Real model call (enable by setting USE_OPENAI=1 in env)
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt or "Say hello"}],
        )
        return jsonify({"ok": True, "reply": resp.choices[0].message.content})
    except Exception as e:
        # Helpful error surface if the key/permissions are missing
        print(f"❌ OpenAI error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


# --- Local dev entrypoint (optional) ---
if __name__ == "__main__":
    # For local testing only: python app.py
    app.run(host="127.0.0.1", port=5000, debug=True)
