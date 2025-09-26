"""
Constraint‑Aware Replacement Engine for Magic: The Gathering Decks
===============================================================

This module implements a simple replacement engine intended to power an
MTG deck‑building assistant.  It accepts a deck list together with
constraints (format, target per‑card budget, player persona and colour
identity) and produces suggestions for cards that violate those
constraints.  It also performs a cost‑to‑finish analysis for the deck
relative to an optional list of already owned cards.  Finally, it
assigns broad roles to every card so that replacements preserve as
much deck functionality as possible.

The implementation uses a small, built‑in database for demonstration
purposes.  In a production deployment this database should be
replaced with a comprehensive data source (e.g. MTGJSON, Scryfall or
other licensed datasets) including up‑to‑date pricing and format
legalities.

Important rules implemented here:

* **Commander colour identity** — A card can only be included in a
  Commander deck if all of the colours in its colour identity are a
  subset of the commander's colour identity.  The official rules
  specify that colour identity is determined by mana symbols in the
  card's mana cost or rules text【575749619764133†L270-L299】.

* **Format legality** — Some cards are banned or restricted in
  various formats.  The built‑in database encodes a simple list of
  banned formats; if a card is banned in the chosen format it will be
  flagged.

* **Budget constraints** — If the per‑card price of a card exceeds
  the target budget, the card is considered a violation.

To extend this module, add more entries to ``CARD_DATABASE`` and
``PRICE_TABLE`` or replace these structures with data loaded from
external sources.

Example usage is provided at the bottom of this file under the
``if __name__ == "__main__"`` guard.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional, Tuple, Iterable


############################
# Sample card database
############################

# Each entry describes a card and its static characteristics.  The
# fields are:
#   oracle_id (str):  Unique identifier for the card.  In a real
#     implementation this should match the official Oracle identifier.
#   color_identity (List[str]): Colours contained in the card's
#     identity.  Colourless cards have an empty list.
#   price_gbp (float):  Approximate market price of the cheapest
#     printing (GBP).  These values are illustrative and should be
#     refreshed from live pricing data.
#   banned_in (List[str]): Formats in which the card is not legal.
#   roles (List[str]): One or more high‑level roles (see roles
#     glossary below) that the card performs.
CARD_DATABASE: Dict[str, Dict[str, object]] = {
    # Expensive staple that creates treasures.  Not legal in Modern or
    # Pioneer but popular in Commander and Legacy.  Price is taken
    # from the MTGGoldfish Commander 2019 entry (≈$13 ≈ £10.5)
    #【575749619764133†L270-L299】 documents colour identity constraints,
    # and MTGGoldfish lists Dockside Extortionist as not legal in
    # Standard, Modern or Pioneer【617806924695690†screenshot】.
    "Dockside Extortionist": {
        "oracle_id": "30e2f721-4a07-4694-9ab4-bc7bb86b50cb",
        "color_identity": ["R"],
        "price_gbp": 10.5,
        "banned_in": ["Modern", "Pioneer", "Standard", "Pauper", "Brawl"],
        "roles": ["Ramp", "Combo Piece"],
    },
    # Fast mana artifact – banned in Modern and Standard but legal in
    # Commander.  Estimated price ~£35.
    "Mana Crypt": {
        "oracle_id": "482df525-7e31-44df-bd98-85cc91f60620",
        "color_identity": [],
        "price_gbp": 35.0,
        "banned_in": ["Modern", "Standard", "Pioneer", "Legacy", "Historic", "Pauper", "Brawl"],
        "roles": ["Ramp"],
    },
    # Card draw enchantment – banned in Modern.  Approximate price ~£20.
    "Rhystic Study": {
        "oracle_id": "e6d522d0-0be8-4dce-9915-f7bb98aa9b38",
        "color_identity": ["U"],
        "price_gbp": 20.0,
        "banned_in": ["Modern", "Pioneer", "Standard", "Pauper", "Brawl"],
        "roles": ["Draw", "Utility"],
    },
    # Cheap mana rock – legal everywhere and very affordable.
    "Arcane Signet": {
        "oracle_id": "6fdc2e51-0795-4cec-bc1b-145c3f181b4e",
        "color_identity": [],
        "price_gbp": 1.5,
        "banned_in": [],
        "roles": ["Ramp", "Fixing"],
    },
    # Expensive free counterspell.  Not legal in Modern.  Price ~£55.
    "Fierce Guardianship": {
        "oracle_id": "7bcba996-5f1c-4c04-955e-fc64ce6f3e6c",
        "color_identity": ["U"],
        "price_gbp": 55.0,
        "banned_in": ["Modern", "Pioneer", "Standard", "Pauper", "Brawl"],
        "roles": ["Protection", "Control"]
    },
    # Budget treasure generator that also provides card advantage.
    "Professional Face-Breaker": {
        "oracle_id": "40ce3c3d-4e38-4821-8c67-6f0d25f8937a",
        "color_identity": ["R"],
        "price_gbp": 4.0,
        "banned_in": ["Standard", "Pioneer"],
        "roles": ["Ramp", "Utility"],
    },
    # Spell slinger payoff that creates treasures for each spell cast.
    "Storm-Kiln Artist": {
        "oracle_id": "7f8c051e-2b20-4c9f-a2f4-c8f955d4c0f2",
        "color_identity": ["R"],
        "price_gbp": 3.0,
        "banned_in": [],
        "roles": ["Ramp", "Combo Piece"],
    },
    # Treasure commander that cares about artifacts dying.
    "Gadrak, the Crown-Scourge": {
        "oracle_id": "c76e679e-3733-4ada-b606-3dbb2b9f4fa8",
        "color_identity": ["R"],
        "price_gbp": 1.0,
        "banned_in": [],
        "roles": ["Wincon", "Ramp"],
    },
    # Sorcery that converts lands into treasures.
    "Brass's Bounty": {
        "oracle_id": "8888a5f8-6212-43b3-938c-750306e83b0d",
        "color_identity": ["R"],
        "price_gbp": 2.5,
        "banned_in": [],
        "roles": ["Ramp", "Utility"],
    },
    # Dragon that doubles treasure output and ramps.
    "Goldspan Dragon": {
        "oracle_id": "fdde6f60-ff8e-42a4-a966-bd02bb123dad",
        "color_identity": ["R"],
        "price_gbp": 15.0,
        "banned_in": [],
        "roles": ["Ramp", "Wincon"],
    },
    # Cheap card draw enchantment for blue decks.  Banned in Modern.
    "Mystic Remora": {
        "oracle_id": "1e4a79b8-316e-4942-ae47-2e3c2d1e283e",
        "color_identity": ["U"],
        "price_gbp": 8.0,
        "banned_in": ["Modern", "Pioneer", "Standard", "Pauper", "Brawl"],
        "roles": ["Draw"]
    },
    # Win condition that checks devotion and draws the deck.  Legal in Commander.
    "Thassa's Oracle": {
        "oracle_id": "674cedad-bf1f-402a-8b32-f56e85fcb2f3",
        "color_identity": ["U"],
        "price_gbp": 5.0,
        "banned_in": ["Legacy", "Vintage", "Pioneer", "Modern", "Standard", "Pauper", "Brawl"],
        "roles": ["Wincon", "Combo Piece"]
    },
    # Instant that removes the library to combo with Thassa's Oracle.
    "Demonic Consultation": {
        "oracle_id": "8d0555c3-015c-443b-b490-833795743666",
        "color_identity": ["B"],
        "price_gbp": 2.5,
        "banned_in": ["Modern", "Legacy", "Pioneer", "Standard", "Historic", "Pauper", "Brawl"],
        "roles": ["Combo Piece"]
    },
    # Ubiquitous mana rock – always legal and extremely cheap.
    "Sol Ring": {
        "oracle_id": "d1acbb31-4f64-4a8e-b166-2e8ba65559f7",
        "color_identity": [],
        "price_gbp": 1.0,
        "banned_in": [],
        "roles": ["Ramp"]
    },
    # Basic lands (colour identity based on type).  Price is zero.
    "Island": {
        "oracle_id": "00000000-0000-0000-0000-000000000001",
        "color_identity": ["U"],
        "price_gbp": 0.05,
        "banned_in": [],
        "roles": ["Fixing"]
    },
    "Mountain": {
        "oracle_id": "00000000-0000-0000-0000-000000000002",
        "color_identity": ["R"],
        "price_gbp": 0.05,
        "banned_in": [],
        "roles": ["Fixing"]
    },
}


# Rough price table for different markets.  Each market entry is a
# dictionary mapping card names to prices in the specified currency.
# In a real implementation these values would be pulled from live
# market feeds or a database.  The markets listed here are purely
# illustrative.
PRICE_TABLE: Dict[str, Dict[str, float]] = {
    "Cardmarket": {
        "Dockside Extortionist": 12.0,  # EUR
        "Professional Face-Breaker": 4.5,
        "Storm-Kiln Artist": 3.5,
        "Gadrak, the Crown-Scourge": 1.2,
        "Brass's Bounty": 3.0,
        "Goldspan Dragon": 17.0,
        "Mana Crypt": 40.0,
        "Rhystic Study": 22.0,
        "Mystic Remora": 9.0,
        "Fierce Guardianship": 60.0,
        "Thassa's Oracle": 6.0,
        "Demonic Consultation": 3.5,
        "Sol Ring": 1.5,
        "Arcane Signet": 2.0,
    },
    "MagicMadhouse": {
        "Dockside Extortionist": 11.0,  # GBP
        "Professional Face-Breaker": 4.0,
        "Storm-Kiln Artist": 2.8,
        "Gadrak, the Crown-Scourge": 0.9,
        "Brass's Bounty": 2.7,
        "Goldspan Dragon": 14.0,
        "Mana Crypt": 38.0,
        "Rhystic Study": 19.0,
        "Mystic Remora": 7.0,
        "Fierce Guardianship": 58.0,
        "Thassa's Oracle": 5.0,
        "Demonic Consultation": 3.0,
        "Sol Ring": 1.0,
        "Arcane Signet": 1.5,
    },
    "TCGplayer": {
        "Dockside Extortionist": 13.0,  # USD
        "Professional Face-Breaker": 5.0,
        "Storm-Kiln Artist": 4.0,
        "Gadrak, the Crown-Scourge": 1.1,
        "Brass's Bounty": 3.5,
        "Goldspan Dragon": 18.0,
        "Mana Crypt": 45.0,
        "Rhystic Study": 23.0,
        "Mystic Remora": 10.0,
        "Fierce Guardianship": 65.0,
        "Thassa's Oracle": 7.0,
        "Demonic Consultation": 4.0,
        "Sol Ring": 1.2,
        "Arcane Signet": 2.2,
    },
}


############################
# Utility functions
############################

def assign_role(card_name: str) -> List[str]:
    """Return the list of roles associated with a card.

    If a card is not known in the database it will be classified as
    "Utility" by default.  Multiple roles are allowed.
    """
    entry = CARD_DATABASE.get(card_name)
    if entry:
        return entry.get("roles", ["Utility"])
    return ["Utility"]


def is_legal(card_name: str, fmt: str) -> bool:
    """Return ``True`` if the given card is legal in the specified format.

    Formats are case sensitive; see entries in the ``banned_in`` lists.
    """
    entry = CARD_DATABASE.get(card_name)
    if not entry:
        return True  # Unknown cards assumed legal
    return fmt not in entry.get("banned_in", [])


def within_budget(card_name: str, budget_gbp: float) -> bool:
    """Return ``True`` if the card's price does not exceed the per‑card budget.

    Unknown cards are considered to have zero price.
    """
    entry = CARD_DATABASE.get(card_name)
    price = entry.get("price_gbp", 0.0) if entry else 0.0
    return price <= budget_gbp


def color_identity_ok(card_name: str, deck_colors: Iterable[str]) -> bool:
    """Return ``True`` if the card's colour identity is a subset of deck colours.

    This implements rule 903.5c: all colours on a card must also appear in
    the commander's colour identity【575749619764133†L270-L299】.
    """
    entry = CARD_DATABASE.get(card_name)
    if not entry:
        return True
    return set(entry.get("color_identity", [])) <= set(deck_colors)


def check_card_constraints(
    card_name: str, fmt: str, budget_gbp: float, deck_colors: Iterable[str]
) -> List[str]:
    """Return a list of constraint violations for the given card.

    Possible violation strings: "Price", "Format", "Color".
    """
    violations: List[str] = []
    if not within_budget(card_name, budget_gbp):
        violations.append("Price")
    if not is_legal(card_name, fmt):
        violations.append("Format")
    if not color_identity_ok(card_name, deck_colors):
        violations.append("Color")
    return violations


def propose_replacements(
    card_name: str,
    fmt: str,
    budget_gbp: float,
    deck_colors: Iterable[str],
    tiers: Tuple[Tuple[str, float], ...] = (("Budget", 5.0), ("Mid", 15.0), ("Premium", float("inf"))),
    max_suggestions: int = 5,
) -> List[Dict[str, object]]:
    """Suggest replacement cards for the specified card.

    Replacements share at least one role with the original card and
    respect colour identity and format legality.  Suggestions are
    grouped into tiers based on maximum price.  The number of
    suggestions returned is limited by ``max_suggestions``; if fewer
    suitable candidates exist then fewer results are returned.

    Each suggestion dictionary contains:
      card_name: Name of the replacement card.
      oracle_id: Oracle identifier.
      tier: Price tier (Budget/Mid/Premium).
      reason: Concise rationale (<25 words).
      price: Dict with currency codes and numeric values.
      roles: List of roles preserved.
    """
    original_roles = set(assign_role(card_name))
    # Build candidate list excluding the original card
    candidates = []
    for name, data in CARD_DATABASE.items():
        if name == card_name:
            continue
        # Skip if card is not legal in the format or colour identity
        if not is_legal(name, fmt):
            continue
        if not color_identity_ok(name, deck_colors):
            continue
        # Share at least one role
        cand_roles = set(data.get("roles", []))
        if not cand_roles & original_roles:
            continue
        candidates.append((name, data))

    # Sort candidates by price ascending so that cheaper cards appear first
    candidates.sort(key=lambda item: item[1].get("price_gbp", 0.0))
    suggestions: List[Dict[str, object]] = []
    for tier_name, tier_max in tiers:
        for name, data in candidates:
            if len(suggestions) >= max_suggestions:
                break
            price = data.get("price_gbp", 0.0)
            if price > tier_max:
                continue
            # Avoid duplicate suggestions for the same card in multiple tiers
            if any(sug["card_name"] == name for sug in suggestions):
                continue
            reason = _build_reason(card_name, name, data)
            suggestions.append({
                "card_name": name,
                "oracle_id": data.get("oracle_id"),
                "tier": tier_name,
                "reason": reason,
                "price": {
                    "GBP": round(price, 2),
                },
                "roles": data.get("roles", []),
            })
        if len(suggestions) >= max_suggestions:
            break
    return suggestions


def _build_reason(original_card: str, replacement_card: str, data: Dict[str, object]) -> str:
    """Generate a concise (<25 words) rationale for a replacement.

    The reason notes the shared roles and emphasises legality or cost
    advantages.  It does not exceed 25 words.
    """
    replacement_roles = data.get("roles", [])
    # Compose a simple message focusing on the first role
    shared_roles = set(assign_role(original_card)) & set(replacement_roles)
    primary_role = next(iter(shared_roles)) if shared_roles else next(iter(replacement_roles), "Utility")
    price = data.get("price_gbp", 0.0)
    reason_parts = []
    reason_parts.append(f"Shares the {primary_role.lower()} role")
    if price <= 5:
        reason_parts.append("and fits a tight budget")
    elif price <= 15:
        reason_parts.append("at a midrange cost")
    else:
        reason_parts.append("as a high‑end upgrade")
    # Mention legality if the original card was banned in the format
    if not is_legal(original_card, 'Commander'):  # Use Commander as common baseline
        reason_parts.append("and is legal where the original is not")
    # Join parts and trim to 25 words
    reason = ", ".join(reason_parts)
    # Enforce word limit
    words = reason.split()
    if len(words) > 25:
        reason = " ".join(words[:25])
    return reason


def compute_cost_to_finish(
    decklist: List[Dict[str, object]],
    owned_cards: Optional[List[str]],
    price_table: Dict[str, Dict[str, float]]
) -> Tuple[List[Dict[str, object]], Dict[str, object]]:
    """Compute the cost to complete the deck across multiple markets.

    Returns a tuple consisting of a list of per‑market totals and a
    dictionary describing the cheapest overall option (best basket).

    The ``decklist`` is a list of dicts with at least ``card_name`` and
    ``qty``.  The ``owned_cards`` list names cards already in the
    player's collection; these are excluded from the cost calculation.
    """
    owned_set = set(owned_cards or [])
    # Determine required quantities of each card not owned
    missing: Dict[str, int] = {}
    for entry in decklist:
        name = entry["card_name"]
        qty = entry.get("qty", 1)
        if name in owned_set:
            continue
        missing[name] = missing.get(name, 0) + qty
    market_totals: List[Dict[str, object]] = []
    best_market: Optional[str] = None
    best_total: float = float("inf")
    for market, prices in price_table.items():
        total = 0.0
        for name, qty in missing.items():
            price = prices.get(name)
            if price is None:
                continue  # Unknown price; assume zero
            total += price * qty
        market_entry = {
            "market": market,
            "currency": "EUR" if market == "Cardmarket" else ("GBP" if market == "MagicMadhouse" else "USD"),
            "total": round(total, 2),
        }
        market_totals.append(market_entry)
        if total < best_total:
            best_total = total
            best_market = market
    best_basket = {
        "market": best_market,
        "currency": next((entry["currency"] for entry in market_totals if entry["market"] == best_market), "GBP"),
        "total": round(best_total, 2),
    }
    return market_totals, best_basket


def analyse_deck(
    fmt: str,
    budget_gbp: float,
    persona: str,
    color_identity: Iterable[str],
    decklist: List[Dict[str, object]],
    owned_cards: Optional[List[str]] = None,
) -> Dict[str, object]:
    """Analyse a deck and produce replacement suggestions and cost summary.

    This is the main entry point for the replacement engine.  It
    iterates over each card in the deck list, checks for violations of
    price, format or colour constraints and proposes suitable
    replacements.  It also assigns roles to each card and computes the
    cost to complete the deck.

    Returns a JSON‑serialisable dictionary with keys:
      "violations" – a list of violation entries.
      "cost_to_finish_by_market" – list of per‑market cost totals.
      "best_basket" – the cheapest overall purchase option.
    """
    violations_output: List[Dict[str, object]] = []
    # Determine role assignments for all cards (useful for synergy notes)
    for item in decklist:
        card = item["card_name"]
        issues = check_card_constraints(card, fmt, budget_gbp, color_identity)
        if not issues:
            continue
        # Provide 3–5 replacement suggestions
        replacements = propose_replacements(
            card_name=card,
            fmt=fmt,
            budget_gbp=budget_gbp,
            deck_colors=color_identity,
            max_suggestions=5,
        )
        violation_entry = {
            "original_card": card,
            "issue": ", ".join(issues),
            "replacements": replacements,
        }
        violations_output.append(violation_entry)

    # Compute cost to finish
    market_totals, best_basket = compute_cost_to_finish(decklist, owned_cards, PRICE_TABLE)

    # Build overall notes based on persona (simple example)
    notes = []
    if persona.lower() == "budget brewer":
        notes.append("Budget persona: prioritise low‑cost synergy pieces over flashy staples.")
    elif persona.lower() == "spike":
        notes.append("Spike persona: emphasise efficiency and high‑impact staples.")
    else:
        notes.append("Persona not recognised; using default recommendation mix.")

    return {
        "violations": violations_output,
        "cost_to_finish_by_market": market_totals,
        "best_basket": best_basket,
        "notes": " ".join(notes),
    }


if __name__ == "__main__":
    # Demonstration of the engine with a sample deck.  Feel free to
    # modify the decklist, format, budget and persona when testing.
    sample_deck = [
        {"card_name": "Dockside Extortionist", "qty": 1},
        {"card_name": "Rhystic Study", "qty": 1},
        {"card_name": "Arcane Signet", "qty": 1},
        {"card_name": "Sol Ring", "qty": 1},
        {"card_name": "Professional Face-Breaker", "qty": 1},
        {"card_name": "Island", "qty": 5},
        {"card_name": "Mountain", "qty": 5},
    ]
    result = analyse_deck(
        fmt="Commander",
        budget_gbp=5.0,
        persona="Budget Brewer",
        color_identity=["U", "R"],
        decklist=sample_deck,
        owned_cards=["Arcane Signet", "Sol Ring"],
    )
    # Print the resulting JSON to stdout
    print(json.dumps(result, indent=2))