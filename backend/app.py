import os
from collections import Counter

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

# -------------------------
# Optional OpenAI import
# -------------------------
try:
    # OpenAI >= 1.x style
    from openai import OpenAI  # type: ignore
    OPENAI_AVAILABLE = True
except Exception:
    OPENAI_AVAILABLE = False
    OpenAI = None  # type: ignore

app = Flask(__name__)
CORS(app)

# -------------------------
# Config (env)
# -------------------------
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_OPENAI = os.getenv("USE_OPENAI", "1") == "1"
MODEL = os.getenv("MODEL", "gpt-4o-mini")
TEMP = float(os.getenv("TEMP", "0.3"))
MAXTOK = int(os.getenv("MAXTOK", "800"))

SCRYFALL = "https://api.scryfall.com"
SPELLBOOK = "https://commanderspellbook.com/api"

# -------------------------
# Utilities
# -------------------------
def http_get(url, **kwargs):
    """requests.get with sensible defaults and error handling."""
    kwargs.setdefault("timeout", 12)
    try:
        r = requests.get(url, **kwargs)
        return r
    except Exception:
        class R:
            status_code = 599
            def json(self): return {}
            text = "request_failed"
        return R()

# -------------------------
# Routes
# -------------------------
@app.route("/")
def root():
    return jsonify({"ok": True, "mode": "openai" if USE_OPENAI else "echo"})

@app.route("/healthz")
def healthz():
    return "ok"

@app.route("/debug")
def debug():
    return jsonify({
        "use_openai": USE_OPENAI,
        "has_openai_key": bool(OPENAI_KEY),
        "openai_available": OPENAI_AVAILABLE,
        "model": MODEL,
        "temp": TEMP,
        "maxtok": MAXTOK,
        "modes": ["default", "rules", "deck_builder", "market_analyst", "tutor"]
    })

@app.route("/api", methods=["POST"])
def api():
    """Chat endpoint. Never crash: fall back to echo if OpenAI is unavailable or errors."""
    data = request.get_json(force=True) or {}
    prompt = data.get("prompt", "")
    mode = data.get("mode", "default")

    if not prompt:
        return jsonify({"ok": False, "error": "Missing prompt"}), 400

    # If OpenAI disabled/missing/key absent → echo instead of 500.
    if not (USE_OPENAI and OPENAI_KEY and OPENAI_AVAILABLE):
        return jsonify({"ok": True, "reply": f"[{mode}] {prompt}"}), 200

    # Attempt OpenAI call; still echo on any runtime failure.
    try:
        client = OpenAI(api_key=OPENAI_KEY)
        completion = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": mode_to_system_prompt(mode)},
                {"role": "user", "content": prompt},
            ],
            temperature=TEMP,
            max_tokens=MAXTOK,
            top_p=1.0,
        )
        # OpenAI >=1.x returns object with .choices[0].message.content
        reply = completion.choices[0].message.content
        return jsonify({"ok": True, "reply": reply}), 200
    except Exception as e:
        # Optional: log e to console; never crash endpoint.
        # print("OpenAI error:", repr(e))
        return jsonify({"ok": True, "reply": f"[echo:{mode}] {prompt}"}), 200

# ---------- Card data ----------
@app.route("/card")
def card():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Missing name"}), 400
    return jsonify({"ok": True, "data": fetch_card_data(name)})

@app.route("/search")
def search():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Missing name"}), 400
    return jsonify({"ok": True, "data": search_card(name)})

# ---------- Deckcheck with charts/combos ----------
@app.route("/deckcheck", methods=["POST"])
def deckcheck():
    data = request.get_json(force=True) or {}
    commander_name = (data.get("commander") or "").strip()
    card_names = data.get("cards", [])

    if not commander_name:
        return jsonify({"ok": False, "error": "Missing commander"}), 400

    commander_data = fetch_card_data(commander_name)
    if not commander_data or not commander_data.get("ok"):
        return jsonify({"ok": False, "error": "Commander not found"}), 404

    # Fetch deck cards
    cards_data = [fetch_card_data(n) for n in card_names if n]
    cards_data = [c for c in cards_data if c.get("ok")]

    mana_curve_counter = Counter()
    color_counter = Counter()
    type_counter = Counter()

    for c in cards_data:
        d = c["data"]
        mv = int(d.get("cmc", 0) or 0)
        mana_curve_counter[mv] += 1

        cols = d.get("colors") or []
        if cols:
            for col in cols:
                color_counter[col] += 1
        else:
            color_counter["Colorless"] += 1

        type_line = (d.get("type_line") or "").split("—")[0]
        for t in type_line.split():
            type_counter[t] += 1

    mana_curve = [{"label": str(k), "value": v} for k, v in sorted(mana_curve_counter.items())]
    colors = [{"label": k, "value": v} for k, v in color_counter.items()]
    types = [{"label": k, "value": v} for k, v in type_counter.items()]

    # Color identity legality
    illegal = []
    commander_colors = set(commander_data["data"].get("color_identity", []))
    for c in cards_data:
        if not set(c["data"].get("color_identity", [])).issubset(commander_colors):
            illegal.append(c["data"]["name"])

    # Combos (best-effort)
    combos = fetch_combos_for_cards([c["data"]["name"] for c in cards_data])

    return jsonify({
        "ok": True,
        "commander": commander_data["data"],
        "checked_count": len(cards_data),
        "illegal_by_color_identity": illegal,
        "manaCurve": mana_curve,
        "colors": colors,
        "types": types,
        "combos": combos
    })

# -------------------------
# Helpers
# -------------------------
def mode_to_system_prompt(mode: str) -> str:
    prompts = {
        "default": "You are a helpful Magic: The Gathering assistant.",
        "rules": "You are an expert MTG rules advisor.",
        "deck_builder": "You are an MTG deckbuilding coach.",
        "market_analyst": "You are an MTG market analyst.",
        "tutor": "You are an MTG tutor."
    }
    return prompts.get(mode, prompts["default"])

def fetch_card_data(name: str):
    r = http_get(f"{SCRYFALL}/cards/named", params={"exact": name})
    if r.status_code != 200:
        return {"ok": False}
    card = r.json()
    return {
        "ok": True,
        "data": {
            "id": card.get("id"),
            "name": card.get("name"),
            "colors": card.get("colors", []),
            "color_identity": card.get("color_identity", []),
            "cmc": card.get("cmc", 0),
            "type_line": card.get("type_line"),
            "image_normal": (card.get("image_uris") or {}).get("normal"),
            "image_small": (card.get("image_uris") or {}).get("small"),
            "oracle_text": card.get("oracle_text", ""),
            "set": card.get("set"),
            "set_name": card.get("set_name"),
            "rarity": card.get("rarity"),
            "scryfall_uri": card.get("scryfall_uri")
        }
    }

def search_card(name: str):
    r = http_get(f"{SCRYFALL}/cards/named", params={"fuzzy": name})
    if r.status_code != 200:
        return {"ok": False}
    card = r.json()
    return {
        "ok": True,
        "data": {
            "id": card.get("id"),
            "name": card.get("name"),
            "colors": card.get("colors", []),
            "color_identity": card.get("color_identity", []),
            "cmc": card.get("cmc", 0),
            "type_line": card.get("type_line"),
            "image_normal": (card.get("image_uris") or {}).get("normal"),
            "image_small": (card.get("image_uris") or {}).get("small"),
            "oracle_text": card.get("oracle_text", ""),
            "set": card.get("set"),
            "set_name": card.get("set_name"),
            "rarity": card.get("rarity"),
            "scryfall_uri": card.get("scryfall_uri")
        }
    }

def fetch_combos_for_cards(card_names):
    results = []
    for name in card_names:
        r = http_get(f"{SPELLBOOK}/combo/search", params={"cards": name})
        if r.status_code == 200:
            j = r.json() or {}
            for combo in j.get("results", []):
                results.append({
                    "name": combo.get("name"),
                    "description": combo.get("description"),
                    "link": combo.get("permalink")
                })
    # dedupe by link+name
    seen = set()
    deduped = []
    for c in results:
        key = (c.get("link"), c.get("name"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    return deduped

# -------------------------
# Entrypoint
# -------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
