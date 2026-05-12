# AI Implementation & Workflow — Doc Index

**Purpose:** Central index of markdown docs for AI implementation, workflow, and testing. Use this to find the right doc when working on chat, prompts, tiers, or AI features.

---

## Core flow & chat

| Doc | Purpose |
|-----|---------|
| **[AI_CHAT_FLOW.md](AI_CHAT_FLOW.md)** | Single source of truth for AI chat: client→stream route, deck context, commander handling, tier classification, model selection, post-processing, card chips. |
| **[MODEL_SWAP_CHAT_TIERS.md](MODEL_SWAP_CHAT_TIERS.md)** | Model mapping by tier (Guest/Free/Pro/Admin): gpt-5.4-mini, gpt-5.4, gpt-5.5. Env overrides, revert steps. |

---

## Prompts & validation

| Doc | Purpose |
|-----|---------|
| **[prompt-system-breakdown.md](prompt-system-breakdown.md)** | How prompts are built: 3-layer composition (BASE + FORMAT + MODULES) vs monolithic fallback. `prompt_layers` vs `prompt_versions`. |
| **[thin_prompt_thick_validator.md](thin_prompt_thick_validator.md)** | Architecture: prompts guide tone; validators enforce legality, correctness. Monolithic fallback phase-out. |

---

## AI test suite

| Doc | Purpose |
|-----|---------|
| **[AI_TEST_SUITE_BREAKDOWN.md](AI_TEST_SUITE_BREAKDOWN.md)** | Full AI test suite: run/batch API, validators, prompt systems, DB schema, admin UI, expected checks. Tier compare (guest/free/pro), archetype expectedChecks, wrong-archetype detection. |

---

## Features & gating

| Doc | Purpose |
|-----|---------|
| **[PRO_IMPLEMENTATION_OVERVIEW.md](PRO_IMPLEMENTATION_OVERVIEW.md)** | Pro status, access levels (Guest/Free/Pro), limits, Pro-gated UI and APIs. |
| **[BUILD_ASSISTANT_FUNCTIONS.md](BUILD_ASSISTANT_FUNCTIONS.md)** | Deck Build Assistant: Check Legality, Budget Swaps, Balance Curve, Re-analyze. Timeouts, endpoints. |

---

## Other AI-related

| Doc | Purpose |
|-----|---------|
| **[feature_tracker.md](feature_tracker.md)** | Historical feature notes, budget swaps, auth, etc. |
| **[ANALYTICS_IMPLEMENTATION.md](../ANALYTICS_IMPLEMENTATION.md)** | Analytics and PRO funnel tracking (frontend root). |

---

## Deck semantic fingerprint & recommendation weighting

| Doc / Module | Purpose |
|--------------|---------|
| **`lib/ai/deck-semantic-fingerprint.ts`** | Oracle-text-based signals (flash, tribal, tokens, sacrifice, etc.) for deck understanding. Uses scryfall_cache (cache-only). Fail-open. Kill-switch: `DISABLE_DECK_SEMANTIC_FINGERPRINT=1`. Injected into full-tier deck context (v2 + raw paths). |
| **`lib/ai/recommendation-weighting.ts`** | Derives weight profile (boosts, suppressions, archetype hints) from fingerprint. Deterministic, no LLM. Steers recommendation priority via compact prompt block. Kill-switch: `DISABLE_DECK_RECOMMENDATION_WEIGHTING=1`. |

---

## Quick reference: chat API routes

| Route | Purpose |
|-------|---------|
| `POST /api/chat/stream` | Main streaming chat (production). |
| `POST /api/chat` | Non-streaming chat (legacy, batch, admin tests). |
| `POST /api/chat/messages` | Save user/assistant message (thread insert). |
| `GET /api/chat/messages/list` | List messages for a thread. |
| `POST /api/chat/voice` | Mobile voice assistant. |

---

## Quick reference: prompt flow

1. **Primary:** `composeSystemPrompt()` → BASE + FORMAT + MODULES from `prompt_layers`.
2. **Fallback:** `getPromptVersion(kind)` → monolithic from `prompt_versions` + `app_config`.
3. **Last resort:** Hardcoded default in code.

---

*Last updated: 2025-03-20*
