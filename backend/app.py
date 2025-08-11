import os
import json
import time
from functools import lru_cache
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

# ---- Config via ENV (no-code tuning) -----------------------------------------
USE_OPENAI = os.getenv("USE_OPENAI", "1") == "1"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Model + sampling defaults (override in Render env for quick tweaks)
MODEL = os.getenv("MODEL", "gpt-4o-mini")
TEMP = float(os.getenv("TEMP", "0.3"))
MAXTOK = int(os.getenv("MAXTOK", "800"))
TOP_P = float(os.getenv("TOP_P", "1"))

# System prompts (override with SYSTEM_PROMPT_* if you want to tweak in env)
DEFAULT_SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT_DEFAULT", """
You are an MTG assistant. Be concise, accurate, and cite card facts explicitly.
Prefer clear bullet points. When giving rules, reference Comprehensive Rules
concepts in plain English (no rule numbers unless asked). When suggesting deck
changes, explain the role each suggested card plays (ramp, draw, removal, wincon).
If a card name is ambiguous, ask which printing/version or provide the safest default.
If you’re unsure, say so and suggest how to verify (e.g., Scryfall link or oracle text).
""").strip()

SYSTEM_PROMPT_RULES = os.getenv("SYSTEM_PROMPT_RULES", """
You are a precise Magic: The Gathering rules judge. Your job: explain rules
interactions and edge cases clearly, step-by-step, with examples. Avoid
hallucination; if a detail might vary by oracle text, say you need the exact
card text and offer to fetch it. Keep tone friendly and authoritative.
""").strip()

SYSTEM_PROMPT_DECK = os.getenv("SYSTEM_PROMPT_DECK", """
You are a Commander deck-building coach. Optimize for a stable mana base,
appropriate ramp/draw/removal counts, and a coherent win plan. Provide
specific cut/add suggestions with reasons (role fit, curve, synergy).
Assume the user has plenty of basic lands and tokens unless they say otherwise.
""").strip()

SYSTEM_PROMPT_MARKET = os.getenv("SYSTEM_PROMPT_MARKET", """
You are an MTG market analyst. Be careful about price data—do NOT invent prices.
Discuss trends, availability, reprint risk, formats, and demand drivers.
If the user wants prices, recommend checking Scryfall or specific vendors
and outline a method, or call an available pricing endpoint if provided.
""").strip()

SYSTEM_PROMPT_TUTOR = os.getenv("SYSTEM_PROMPT_TUTOR", """
You are a card tutor assistant. Given a strategy (e.g., aristocrats, +1/+1 counters),
suggest on-theme staples and underrated picks. Group suggestions by role:
ramp, draw, removal, synergy pieces, win conditions, utility lands.
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
    """
    Calls OpenAI Chat Completions (non-streaming).
    Uses official HTTP endpoint to avoid SDK version drift.
    """
    if not USE_OPENAI:
        # Echo mode mirror for dev
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
    url = f"{SCRYFALL_BASE}/cards/named"
    try:
        r = requests.get(url, params={"exact": name}, timeout=20)
        return r.json()
    except requests.RequestException as e:
        return {"object": "error", "details": str(e)}

@lru_cache(maxsize=1024)
def scryfall_named_fuzzy(name: str) -> Dict[str, Any]:
    url = f"{SCRYFALL_BASE}/cards/named"
    try:
        r = requests.get(url, params={"fuzzy": name}, timeout=20)
        return r.json()
    except requests.RequestException as e:
        return {"object": "error", "details": str(e)}

def extract_card_summary(sf: Dict[str, Any]) -> Dict[str, Any]:
    """Small, safe summary to pass into prompts/UI."""
    if not sf or sf.get("object") == "error":
        return {"ok": False, "name": None}
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
        "image_small": (sf.get("image_uris") or {}).get("small") if sf.get("image_uris") else None,
        "image_normal": (sf.get("image_uris") or {}).get("normal") if sf.get("image_uris") else None,
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
    # Check OpenAI (only if enabled)
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

    # Check Scryfall
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

# --- Deck legality sketch (Commander) -----------------------------------------
@app.post("/deckcheck")
def deckcheck():
    """
    Body: { "commander": "Atraxa, Praetors' Voice", "cards": ["Sol Ring", "Swords to Plowshares", ...] }
    Returns basic commander color identity check and unknowns.
    """
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
    """
    try:
        body = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    prompt = (body or {}).get("prompt", "").strip()
    if not prompt:
        return jsonify({"ok": False, "error": "prompt required"}), 400

    mode = (body or {}).get("mode", "default")
    system_prompt = ASSISTANT_MODES.get(mode, DEFAULT_SYSTEM_PROMPT)

    # Optional settings overrides
    temperature = body.get("temperature")
    max_tokens = body.get("max_tokens")
    top_p = body.get("top_p")
    model = body.get("model") or MODEL

    # Optional context + card fetch
    context_msgs = body.get("context") or []
    cards = body.get("cards") or []
    card_summaries = []
    if cards and isinstance(cards, list):
        for name in cards[:25]:  # safeguard
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
    # Keep only last ~8 user/assistant turns if context is huge
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
