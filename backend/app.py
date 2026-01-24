# backend/app.py
import os
import re
from collections import Counter, defaultdict
from typing import Dict, Tuple

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

# -------------------------
# Optional OpenAI import
# -------------------------
try:
    from openai import OpenAI  # type: ignore
    OPENAI_AVAILABLE = True
except Exception:
    OPENAI_AVAILABLE = False
    OpenAI = None  # type: ignore

app = Flask(__name__)

# ---- CORS ---------------------------------------------------------
raw_origins = os.getenv("CORS_ORIGINS", "https://manatap.ai,https://app.manatap.ai,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in raw_origins.replace(" ", "").split(",") if o.strip()]
CORS(
    app,
    resources={r"/api/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "supports_credentials": True
    }},
    supports_credentials=True,
)

@app.after_request
def add_cors_headers(resp):
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
    return resp

# Handle preflight OPTIONS requests explicitly
@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_preflight(path):
    response = jsonify({"ok": True, "message": "Preflight OK"})
    response.status_code = 200
    return response
# ------------------------------------------------------------------

# -------------------------
# Config (env)
# -------------------------
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_OPENAI = os.getenv("USE_OPENAI", "1") == "1"
MODEL = os.getenv("MODEL", "gpt-4o-mini")

# Avoid Windows TEMP collision; tolerant parse
raw_temp = os.getenv("OPENAI_TEMPERATURE")
try:
    TEMP = float(raw_temp) if raw_temp is not None else 0.3
except (TypeError, ValueError):
    TEMP = 0.3

MAXTOK = int(os.getenv("MAXTOK", "800"))

SCRYFALL = "https://api.scryfall.com"
SPELLBOOK = "https://commanderspellbook.com/api"

# -------------------------
# Utilities
# -------------------------
def http_get(url, **kwargs):
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

PRICE_CACHE: Dict[Tuple[str, str], float] = {}

def scryfall_price(card_name: str, currency: str = "USD") -> float:
    """
    Best-effort unit price via Scryfall. Supports USD and EUR.
    Falls back to 0 if price unavailable. GBP -> USD.
    """
    currency = (currency or "USD").upper()
    key = (card_name.lower(), currency)
    if key in PRICE_CACHE:
        return PRICE_CACHE[key]

    r = http_get(f"{SCRYFALL}/cards/named", params={"exact": card_name})
    if r.status_code != 200:
        PRICE_CACHE[key] = 0.0
        return 0.0

    data = r.json() or {}
    prices = data.get("prices") or {}

    if currency == "EUR":
        raw = prices.get("eur")
    else:
        raw = prices.get("usd")  # GBP (and anything else) treated as USD

    try:
        val = float(raw) if raw not in (None, "", "null") else 0.0
    except Exception:
        val = 0.0

    PRICE_CACHE[key] = val
    return val

LINE_RE = re.compile(r"^\s*(\d+)\s*[xX]?\s+(.+?)\s*$")

def parse_deck_text(deck_text: str) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for raw in (deck_text or "").splitlines():
        m = LINE_RE.match(raw)
        if not m:
            continue
        qty = int(m.group(1))
        name = m.group(2).strip()
        if qty > 0 and name:
            counts[name] += qty
    return counts

def compute_rows(deck_counts: Dict[str, int], owned: Dict[str, int], currency: str):
    rows = []
    total = 0.0
    for name, want in deck_counts.items():
        have = int(owned.get(name, 0) or 0)
        need = max(0, want - have)
        if need <= 0:
            continue
        unit = scryfall_price(name, currency)
        sub = round(unit * need, 2)
        total += sub
        rows.append({
            "card": name,
            "need": need,
            "unit": unit,
            "subtotal": sub,
        })
    rows.sort(key=lambda r: (-r["subtotal"], r["card"]))
    return rows, round(total, 2)

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
        "allowed_origins": ALLOWED_ORIGINS,
    })

@app.route("/api", methods=["POST"])
def api():
    data = request.get_json(force=True) or {}
    prompt = data.get("prompt", "")
    mode = data.get("mode", "default")
    if not prompt:
        return jsonify({"ok": False, "error": "Missing prompt"}), 400

    if not (USE_OPENAI and OPENAI_KEY and OPENAI_AVAILABLE):
        return jsonify({"ok": True, "reply": f"[{mode}] {prompt}"}), 200

    try:
        client = OpenAI(api_key=OPENAI_KEY)
        completion = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": mode_to_system_prompt(mode)},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=MAXTOK,
        )
        reply = completion.choices[0].message.content
        return jsonify({"ok": True, "reply": reply}), 200
    except Exception:
        return jsonify({"ok": True, "reply": f"[echo:{mode}] {prompt}"}), 200

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

@app.route("/api/collections/cost", methods=["POST", "OPTIONS"])
def collections_cost():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True) or {}
    deck_text = data.get("deck_text") or data.get("deckText") or ""
    currency = (data.get("currency") or "USD").upper()
    owned = data.get("owned") or {}

    if not deck_text.strip():
        return jsonify({"ok": False, "error": "Missing 'deck_text'/'deckText'"}), 400

    deck_counts = parse_deck_text(deck_text)
    rows, total = compute_rows(deck_counts, owned, currency)

    return jsonify({
        "ok": True,
        "currency": currency,
        "rows": rows,
        "total": total,
        "usedOwned": bool(owned),
    }), 200

@app.route("/api/collections/cost-to-finish", methods=["POST", "OPTIONS"])
def collections_cost_alias():
    return collections_cost()

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

    illegal = []
    commander_colors = set(commander_data["data"].get("color_identity", []))
    for c in cards_data:
        card_colors = set(c["data"].get("color_identity", []))
        if not card_colors.issubset(commander_colors):
            illegal.append(c["data"]["name"])

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
            j = (r.json() or {})
            for combo in j.get("results", []):
                results.append({
                    "name": combo.get("name"),
                    "description": combo.get("description"),
                    "link": combo.get("permalink")
                })
    seen = set()
    deduped = []
    for c in results:
        key = (c.get("link"), c.get("name"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    return deduped

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
