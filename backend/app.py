import os
import json
import time
from functools import lru_cache
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

# ---- Config via ENV ----------------------------------------------------------
USE_OPENAI = os.getenv("USE_OPENAI", "1") == "1"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

MODEL = os.getenv("MODEL", "gpt-4o-mini")
TEMP = float(os.getenv("TEMP", "0.3"))
MAXTOK = int(os.getenv("MAXTOK", "800"))
TOP_P = float(os.getenv("TOP_P", "1"))

# Spellbook base (leave overrideable)
SPELLBOOK_BASE = os.getenv("SPELLBOOK_API_URL", "https://backend.commanderspellbook.com")

# --- System prompts (encourage [[Card Name]] in answers) ----------------------
DEFAULT_SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT_DEFAULT", """
You are an MTG assistant. Be concise, accurate, and prefer bullet points.
When you reference a specific card, wrap the exact card name in [[double brackets]],
e.g., [[Sol Ring]]. If you’re unsure on a fact, say so and suggest verifying
with oracle text. Render lists and examples as Markdown.
""").strip()

SYSTEM_PROMPT_RULES = os.getenv("SYSTEM_PROMPT_RULES", """
You are a precise Magic: The Gathering rules judge. Explain interactions clearly,
step-by-step, with short examples. Wrap card names in [[double brackets]].
Avoid hallucinations; if details vary by oracle text, say you need exact text.
""").strip()

SYSTEM_PROMPT_DECK = os.getenv("SYSTEM_PROMPT_DECK", """
You are a Commander deck-building coach. Optimize mana base, ramp/draw/removal
counts, and a coherent win plan. Provide specific cut/adds with reasons.
Wrap all card names in [[double brackets]] so the UI can show cards.
""").strip()

SYSTEM_PROMPT_MARKET = os.getenv("SYSTEM_PROMPT_MARKET", """
You are an MTG market analyst. Do NOT invent prices. Discuss trends, reprint risk,
formats, and demand drivers. Suggest where to check prices. When naming cards,
wrap them in [[double brackets]] so the UI can show cards.
""").strip()

SYSTEM_PROMPT_TUTOR = os.getenv("SYSTEM_PROMPT_TUTOR", """
You are a card tutor assistant. Given a strategy, suggest on-theme staples and
underrated picks, grouped by role (ramp/draw/removal/synergy/wincons/lands).
Always wrap card names in [[double brackets]].
""").strip()

ASSISTANT_MODES: Dict[str, str] = {
    "default": DEFAULT_SYSTEM_PROMPT,
    "rules": SYSTEM_PROMPT_RULES,
    "deck_builder": SYSTEM_PROMPT_DECK,
    "market_analyst": SYSTEM_PROMPT_MARKET,
    "tutor": SYSTEM_PROMPT_TUTOR,
}

# ---- Flask -------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

# ---- Helpers: OpenAI ---------------------------------------------------------
def _openai_chat(messages: List[Dict[str, str]],
                 model: Optional[str] = None,
                 temperature: Optional[float] = None,
                 max_tokens: Optional[int] = None,
                 top_p: Optional[float] = None) -> Dict[str, Any]:
    if not USE_OPENAI:
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        return {"ok": True, "reply": f"[echo-mode] {last_user}", "raw": {"mode": "echo"}}

    if not OPENAI_API_KEY:
        return {"ok": False, "error": "OPENAI_API_KEY not set"}

    payload = {
        "model": model or MODEL,
        "messages": messages,
        "temperature": TEMP if temperature is None else temperature,
        "max_tokens": MAXTOK if max_tokens is None else max_tokens,
        "top_p": TOP_P if top_p is None else top_p,
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        if resp.status_code != 200:
            return {"ok": False, "error": f"OpenAI HTTP {resp.status_code}", "details": resp.text}
        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
        return {"ok": True, "reply": reply, "raw": data}
    except requests.RequestException as e:
        return {"ok": False, "error": "OpenAI request failed", "details": str(e)}

# ---- Helpers: Scryfall -------------------------------------------------------
SCRYFALL_BASE = "https://api.scryfall.com"

@lru_cache(maxsize=1024)
def scryfall_named_exact(name: str) -> Dict[str, Any]:
    try:
        r = requests.get(f"{SCRYFALL_BASE}/cards/named", params={"exact": name}, timeout=20)
        return r.json()
    except requests.RequestException as e:
        return {"object": "error", "details": str(e)}

@lru_cache(maxsize=1024)
def scryfall_named_fuzzy(name: str) -> Dict[str, Any]:
    try:
        r = requests.get(f"{SCRYFALL_BASE}/cards/named", params={"fuzzy": name}, timeout=20)
        return r.json()
    except requests.RequestException as e:
        return {"object": "error", "details": str(e)}

def scryfall_search(q: str, limit: int = 12) -> Dict[str, Any]:
    try:
        r = requests.get(f"{SCRYFALL_BASE}/cards/search", params={"q": q}, timeout=25)
        data = r.json()
        cards = []
        for c in data.get("data", [])[:limit]:
            cards.append(extract_card_summary(c))
        return {"ok": True, "count": len(cards), "cards": cards, "has_more": data.get("has_more", False)}
    except requests.RequestException as e:
        return {"ok": False, "error": str(e)}

def extract_card_summary(sf: Dict[str, Any]) -> Dict[str, Any]:
    if not sf or sf.get("object") == "error":
        return {"ok": False, "name": None}
    uris = sf.get("image_uris") or {}
    return {
        "ok": True,
        "id": sf.get("id"),
        "name": sf.get("name"),
        "mana_cost": sf.get("mana_cost"),
        "type_line": sf.get("type_line"),
        "oracle_text": sf.get("oracle_text"),
        "colors": sf.get("colors"),
        "color_identity": sf.get("color_identity"),
        "set": sf.get("set"),
        "set_name": sf.get("set_name"),
        "rarity": sf.get("rarity"),
        "legalities": sf.get("legalities", {}),
        "image_small": uris.get("small"),
        "image_normal": uris.get("normal"),
        "scryfall_uri": sf.get("scryfall_uri"),
    }

def summarize_cards_for_prompt(cards: List[Dict[str, Any]]) -> str:
    lines = []
    for c in cards:
        if not c.get("ok"):
            continue
        line = f"- {c.get('name')} :: {c.get('type_line')} :: {c.get('mana_cost') or ''}\n  {c.get('oracle_text') or ''}"
        lines.append(line.strip())
    return "\n".join(lines)

# ---- Basic parsing helpers ---------------------------------------------------
def parse_deck_text_to_names(text: str) -> List[str]:
    """Accept Moxfield/Archidekt exports or plain 'N Name' lines."""
    out = []
    for raw in (text or "").splitlines():
        s = raw.strip()
        if not s:
            continue
        # Remove leading count like '3x ' or '2 '
        s = s.replace("\t", " ")
        parts = s.split(" ")
        if parts and (parts[0].endswith("x") or parts[0].isdigit()):
            parts = parts[1:]
        name = " ".join(parts).strip()
        # ignore comments/sideboard markers
        if name.startswith("#") or name.lower().startswith("sideboard"):
            continue
        out.append(name)
    return out

# ---- Routes ------------------------------------------------------------------
@app.get("/")
def root():
    mode = "openai" if USE_OPENAI else "echo"
    return jsonify({"ok": True, "service": "mtg-ai-assistant-backend", "mode": mode})

@app.get("/healthz")
def healthz():
    return "ok", 200

@app.get("/healthz/full")
def healthz_full():
    status = {"backend": "ok", "openai": "disabled" if not USE_OPENAI else "unknown", "scryfall": "unknown"}
    if USE_OPENAI and OPENAI_API_KEY:
        try:
            t0 = time.time()
            test = _openai_chat([{"role": "system", "content": "Say OK once."},
                                 {"role": "user", "content": "Ping"}], max_tokens=3)
            status["openai"] = "ok" if test.get("ok") else f"error: {test.get('error')}"
            status["openai_latency_ms"] = int((time.time() - t0) * 1000)
        except Exception as e:
            status["openai"] = f"error: {e}"
    elif USE_OPENAI and not OPENAI_API_KEY:
        status["openai"] = "error: missing OPENAI_API_KEY"
    else:
        status["openai"] = "disabled"

    try:
        r = requests.get(f"{SCRYFALL_BASE}/sets", timeout=10)
        status["scryfall"] = "ok" if r.status_code == 200 else f"HTTP {r.status_code}"
    except requests.RequestException as e:
        status["scryfall"] = f"error: {e}"

    return jsonify(status), 200

@app.get("/debug")
def debug():
    return jsonify({
        "use_openai": USE_OPENAI,
        "has_openai_key": bool(OPENAI_API_KEY),
        "model": MODEL,
        "temp": TEMP,
        "maxtok": MAXTOK,
        "top_p": TOP_P,
        "modes": list(ASSISTANT_MODES.keys()),
    })

# --- Scryfall passthroughs ----------------------------------------------------
@app.get("/card")
def card_exact():
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"ok": False, "error": "name query param required"}), 400
    data = scryfall_named_exact(name)
    return jsonify({"ok": data.get("object") != "error", "data": extract_card_summary(data), "raw": data})

@app.get("/search")
def card_fuzzy():
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"ok": False, "error": "name query param required"}), 400
    data = scryfall_named_fuzzy(name)
    return jsonify({"ok": data.get("object") != "error", "data": extract_card_summary(data), "raw": data})

@app.get("/scry/query")
def scry_query():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"ok": False, "error": "q query param required"}), 400
    res = scryfall_search(q, limit=int(request.args.get("limit", "12")))
    return jsonify(res), (200 if res.get("ok") else 500)

# --- Commander color identity check ------------------------------------------
@app.post("/deckcheck")
def deckcheck():
    try:
        body = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    commander = (body or {}).get("commander", "")
    names = (body or {}).get("cards", [])
    if not commander or not isinstance(names, list):
        return jsonify({"ok": False, "error": "commander and cards[] required"}), 400

    cmd = scryfall_named_fuzzy(commander)
    if cmd.get("object") == "error":
        return jsonify({"ok": False, "error": f"Commander not found: {commander}"}), 400

    cmd_ci = set(cmd.get("color_identity") or [])
    unknown, illegal = [], []
    checked = []

    for n in names:
        sf = scryfall_named_fuzzy(n)
        if sf.get("object") == "error":
            unknown.append(n)
            continue
        ci = set(sf.get("color_identity") or [])
        if not ci.issubset(cmd_ci):
            illegal.append(sf.get("name"))
        checked.append(extract_card_summary(sf))

    return jsonify({
        "ok": True,
        "commander": extract_card_summary(cmd),
        "illegal_by_color_identity": illegal,
        "unknown": unknown,
        "checked_count": len(checked),
    })

# --- Deck analyze (curve, colors, types) --------------------------------------
@app.post("/deck/analyze")
def deck_analyze():
    """
    Body:
      { "deck_text": "2 Sol Ring\n1 Swords to Plowshares\n..." }
      OR { "cards": ["Sol Ring", "Swords to Plowshares", ...] }
    """
    try:
        body = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    cards = body.get("cards")
    if not cards:
        deck_text = body.get("deck_text", "")
        cards = parse_deck_text_to_names(deck_text)

    if not isinstance(cards, list) or len(cards) == 0:
        return jsonify({"ok": False, "error": "Provide deck_text or cards[]"}), 400

    # Fetch Scryfall data (fuzzy) and compute stats
    curve = {}          # mana value histogram
    color_pips = {"W":0,"U":0,"B":0,"R":0,"G":0,"C":0}
    type_breakdown = {} # e.g., Creature, Instant, Artifact...
    fetched = []

    for name in cards[:300]:   # safety cap
        sf = scryfall_named_fuzzy(name)
        if sf.get("object") == "error":
            continue
        summary = extract_card_summary(sf)
        fetched.append(summary)

        # Mana value (cmc)
        mv = sf.get("cmc")
        if isinstance(mv, (int, float)):
            mv = int(round(mv))
            curve[mv] = curve.get(mv, 0) + 1

        # Color pips from color_identity
        for pip in (summary.get("color_identity") or []):
            if pip in color_pips:
                color_pips[pip] += 1
        if not summary.get("color_identity"):
            color_pips["C"] += 1

        # Type breakdown (take first supertype/subtype word)
        tline = (summary.get("type_line") or "")
        primary = tline.split("—")[0].strip() if "—" in tline else tline
        # choose first type in primary (e.g., "Artifact Creature" -> "Artifact")
        if primary:
            first = primary.split()[0]
            type_breakdown[first] = type_breakdown.get(first, 0) + 1

    # Aggregate
    total = len(fetched)
    curve_list = [{"mv": k, "count": v} for k, v in sorted(curve.items())]
    color_list = [{"pip": k, "count": v} for k, v in color_pips.items()]
    type_list = [{"type": k, "count": v} for k, v in sorted(type_breakdown.items(), key=lambda x: -x[1])]

    return jsonify({
        "ok": True,
        "total_cards_parsed": total,
        "mana_curve": curve_list,
        "color_pips": color_list,
        "types": type_list,
    })

# --- Combos via Commander Spellbook (best effort) -----------------------------
@app.post("/combos/check")
def combos_check():
    """
    Body:
      { "deck_text": "...", "format": "commander" }
      OR { "cards": ["Helm of the Host", "Godo, Bandit Warlord"] }
    Tries Commander Spellbook backend. If their API is unreachable, returns a clear error.
    """
    try:
        body = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    deck_text = body.get("deck_text", "")
    cards = body.get("cards")
    fmt = (body.get("format") or "commander").lower()

    if not cards:
        cards = parse_deck_text_to_names(deck_text)
    if not isinstance(cards, list) or len(cards) == 0:
        return jsonify({"ok": False, "error": "Provide deck_text or cards[]"}), 400

    # Spellbook expects plain text in many tools; we join names for a first pass.
    # Try a couple of known endpoints; fall back with a friendly error if blocked.
    payload_text = "\n".join([f"1 {c}" for c in cards])

    tried = []
    try:
        # 1) Known swagger advertises 'card-list-from-text' (format selectable)
        url1 = f"{SPELLBOOK_BASE}/card-list-from-text"
        r1 = requests.get(url1, params={"format": fmt, "text": payload_text}, timeout=25)
        tried.append({"url": url1, "status": r1.status_code})
        if r1.status_code == 200:
            data = r1.json()
            return jsonify({"ok": True, "source": "spellbook", "result": data})
    except requests.RequestException as e:
        tried.append({"url": "error@card-list-from-text", "error": str(e)})

    # Could add more variants here if Spellbook exposes other endpoints.
    return jsonify({
        "ok": False,
        "error": "Commander Spellbook API not reachable or changed. Try again later.",
        "tried": tried
    }), 502

# --- Main chat endpoint --------------------------------------------------------
@app.post("/api")
def api():
    """
    Body:
    {
      "prompt": "text...",
      "mode": "rules|deck_builder|market_analyst|tutor|default",
      "temperature": 0.2, "max_tokens": 800, "top_p": 1,
      "cards": ["Sol Ring","Smothering Tithe"],   # optional: we will fetch and include oracle summaries
      "context": [ {"role":"user","content":"..."}, ... ]  # optional prior messages
    }

    Special: if prompt starts with "search:" we run a Scryfall query and return
    results as Markdown (no GPT call).
    """
    try:
        body = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    prompt = (body or {}).get("prompt", "").strip()
    if not prompt:
        return jsonify({"ok": False, "error": "prompt required"}), 400

    # --- "search:" command shortcut
    if prompt.lower().startswith("search:"):
        q = prompt.split(":", 1)[1].strip()
        res = scryfall_search(q, limit=12)
        if not res.get("ok"):
            return jsonify({"ok": False, "error": res.get("error")}), 500
        # render a tiny markdown summary
        lines = [f"### Scryfall results for `{q}` ({res['count']}{'+' if res.get('has_more') else ''})"]
        for c in res["cards"]:
            line = f"- [[{c.get('name') or 'Unknown'}]] — {c.get('type_line') or ''}"
            if c.get("scryfall_uri"):
                line += f"  \n  {c['scryfall_uri']}"
            lines.append(line)
        return jsonify({
            "ok": True,
            "reply": "\n".join(lines),
            "used": {"mode": "search", "query": q, "count": res["count"], "has_more": res.get("has_more", False)}
        })

    mode = (body or {}).get("mode", "default")
    system_prompt = ASSISTANT_MODES.get(mode, DEFAULT_SYSTEM_PROMPT)

    temperature = body.get("temperature")
    max_tokens = body.get("max_tokens")
    top_p = body.get("top_p")
    model = body.get("model") or MODEL

    context_msgs = body.get("context") or []
    cards = body.get("cards") or []
    card_summaries = []
    if cards and isinstance(cards, list):
        for name in cards[:25]:
            sf = scryfall_named_fuzzy(str(name))
            card_summaries.append(extract_card_summary(sf))

    card_block = summarize_cards_for_prompt(card_summaries) if card_summaries else ""
    prompt_with_cards = prompt
    if card_block:
        prompt_with_cards = (
            f"{prompt}\n\n"
            f"—\nHere are card oracle summaries you can rely on:\n{card_block}"
        )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if isinstance(context_msgs, list):
        trimmed = context_msgs[-8:]
        for m in trimmed:
            if isinstance(m, dict) and m.get("role") in ("user", "assistant", "system") and isinstance(m.get("content"), str):
                messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": prompt_with_cards})

    out = _openai_chat(messages, model=model, temperature=temperature, max_tokens=max_tokens, top_p=top_p)
    if not out.get("ok"):
        return jsonify({"ok": False, "error": out.get("error"), "details": out.get("details")}), 500

    return jsonify({
        "ok": True,
        "reply": out.get("reply"),
        "used": {
            "mode": mode,
            "model": model,
            "temperature": temperature if temperature is not None else TEMP,
            "max_tokens": max_tokens if max_tokens is not None else MAXTOK,
            "top_p": top_p if top_p is not None else TOP_P,
            "cards_supplied": len(cards),
        },
    })

# ---- Main --------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
