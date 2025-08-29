# backend/app.py
import os
from flask import Flask, request, jsonify
from openai import OpenAI

app = Flask(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.route("/api", methods=["POST"])
def api():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    print(f"🛰 /api hit | prompt={prompt}", flush=True)

    # To keep infra testing simple, just echo. 
    # (Uncomment the call below after everything works)
    # resp = client.chat.completions.create(
    #     model="gpt-4o-mini",
    #     messages=[{"role":"user","content": prompt or "Say hello"}],
    # )
    # return jsonify({"ok": True, "reply": resp.choices[0].message.content})

    return jsonify({"ok": True, "echo": prompt})
