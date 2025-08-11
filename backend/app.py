import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from collections import defaultdict
from uuid import uuid4

app = Flask(__name__)
CORS(app)

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_OPENAI = os.getenv("USE_OPENAI", "1") == "1"
MODEL = os.getenv("MODEL", "gpt-4o-mini")
TEMP = float(os.getenv("TEMP", "0.3"))
MAXTOK = int(os.getenv("MAXTOK", "800"))

# Memory storage for session-based chat
SESSION_MEMORY = {}

# Currency cache to avoid hitting API too often
CURRENCY_CACHE = {"rates": None, "last_fetch": None}

SCRYFALL_API = "https://api.scryfall.com"
COMMANDER_SPELLBOOK_API = "https://commanderspellbook.com/api/combo"

# --- Helpers ---

def fetch_currency_rates():
    import time
    if CURRENCY_CACHE["rates"] and (time.time() - CURRENCY_CACHE["last_fetch"]) < 3600:
        return CURRENCY_CACHE["rates"]
    url = "https://api.exchangerate.host/latest?base=USD&symbols=USD,EUR,GBP"
    r = requests.get(url)
    if r.status_code == 200:
        data = r.json()
        CURRENCY_CACHE["rates"] = data["rates"]
        CURRENCY_CACHE["last_fetch"] = time.time()
        return data["rates"]
    return {"USD": 1, "EUR": 0.9, "GBP": 0.78}

def convert_price(usd_price):
    rates = fetch_currency_rates()
    return {
        "USD": round(usd_price, 2),
        "EUR": round(usd_price * rates["EUR"], 2),
        "GBP": round(usd_price * rates["GBP"], 2)
    }

def get_scryfall_card(name):
    resp = requests.get(f"{SCRYFALL_API}/cards/named", params={"fuzzy": name})
    if resp.status_code == 200:
        return resp.json()
    return None

# --- Routes ---

@app.route("/")
def root():
    return jsonify({"ok": True, "mode": "openai" if USE_OPENAI else "echo"})

@app.route("/debug")
def debug():
    return jsonify({
        "use_openai": USE_OPENAI,
        "has_openai_key": bool(OPENAI_KEY),
        "model": MODEL,
        "temp": TEMP,
        "maxtok": MAXTOK,
        "modes": ["default", "rules", "deck_builder", "market_analyst", "tutor"]
    })

@app.route("/search")
def search():
    name = request.args.get("name", "")
    if not name:
        return jsonify({"ok": False, "error": "Missing name"}), 400
    r = requests.get(f"{SCRYFALL_API}/cards/search", params={"q": name})
    if r.status_code != 200:
        return jsonify({"ok": False, "error": "Not found"})
    data = r.json()
    if "data" not in data or not data["data"]:
        return jsonify({"ok": False, "error": "No matches"})
    card = data["data"][0]
    return jsonify({"ok": True, "data": card})

@app.route("/price")
def price():
    name = request.args.get("name", "")
    if not name:
        return jsonify({"ok": False, "error": "Missing name"}), 400
    card = get_scryfall_card(name)
    if not card or "prices" not in card:
        return jsonify({"ok": False, "error": "No price found"})
    try:
        usd_price = float(card["prices"]["usd"]) if card["prices"]["usd"] else 0
    except:
        usd_price = 0
    return jsonify({
        "ok": True,
        "name": card["name"],
        "prices": convert_price(usd_price)
    })

@app.route("/deckcheck", methods=["POST"])
def deckcheck():
    data = request.get_json()
    commander_name = data.get("commander", "")
    cards = data.get("cards", [])
    if not commander_name or not cards:
        return jsonify({"ok": False, "error": "Commander and cards required"}), 400

    commander = get_scryfall_card(commander_name)
    if not commander:
        return jsonify({"ok": False, "error": "Commander not found"}), 404

    legal_identity = set(commander.get("color_identity", []))
    illegal_by_color = []
    mana_curve = defaultdict(int)
    color_count = defaultdict(int)
    type_count = defaultdict(int)
    detailed_cards = []

    for card_name in cards:
        card_data = get_scryfall_card(card_name)
        if not card_data:
            continue
        detailed_cards.append({
            "name": card_data["name"],
            "image": card_data["image_uris"]["small"] if "image_uris" in card_data else None,
            "mana_cost": card_data.get("mana_cost", ""),
            "type_line": card_data.get("type_line", ""),
            "cmc": card_data.get("cmc", 0),
            "colors": card_data.get("colors", []),
            "color_identity": card_data.get("color_identity", [])
        })

        # Color legality
        if not set(card_data.get("color_identity", [])).issubset(legal_identity):
            illegal_by_color.append(card_data["name"])

        # Mana curve
        mana_curve[int(card_data.get("cmc", 0))] += 1

        # Color breakdown
        if card_data.get("colors"):
            for c in card_data["colors"]:
                color_count[c] += 1
        else:
            color_count["Colorless"] += 1

        # Type breakdown
        if "type_line" in card_data:
            primary_type = card_data["type_line"].split("—")[0].strip().split(" ")[0]
            type_count[primary_type] += 1

    # Fetch combos from Commander Spellbook
    combo_resp = requests.get(COMMANDER_SPELLBOOK_API, params={"q": "||".join(cards)})
    combos = combo_resp.json().get("results", []) if combo_resp.status_code == 200 else []

    return jsonify({
        "ok": True,
        "commander": commander,
        "illegal_by_color_identity": illegal_by_color,
        "mana_curve": dict(mana_curve),
        "color_breakdown": dict(color_count),
        "type_breakdown": dict(type_count),
        "cards": detailed_cards,
        "combos": combos
    })

@app.route("/api", methods=["POST"])
def api():
    data = request.get_json()
    prompt = data.get("prompt", "")
    mode = data.get("mode", "default")
    session_id = data.get("session_id") or str(uuid4())

    if not USE_OPENAI:
        return jsonify({"ok": True, "echo": f"[{mode}] {prompt}", "session_id": session_id})

    history = SESSION_MEMORY.get(session_id, [])
    history.append({"role": "user", "content": prompt})

    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)
    completion = client.chat.completions.create(
        model=MODEL,
        messages=history,
        temperature=TEMP,
        max_tokens=MAXTOK,
        top_p=1.0
    )
    reply = completion.choices[0].message["content"]
    history.append({"role": "assistant", "content": reply})
    SESSION_MEMORY[session_id] = history

    return jsonify({"ok": True, "reply": reply, "session_id": session_id})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
