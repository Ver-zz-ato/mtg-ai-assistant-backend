# AI Implementation & Workflow — Doc Index

**Purpose:** Central index of markdown docs for AI implementation, workflow, and testing. Use this to find the right doc when working on chat, prompts, tiers, or AI features.

---

## Core flow & chat

| Doc | Purpose |
|-----|---------|
| **[AI_CHAT_FLOW.md](AI_CHAT_FLOW.md)** | Single source of truth for AI chat: client→stream route, deck context, commander handling, tier classification, model selection, post-processing, card chips. |
| **[MODEL_SWAP_CHAT_TIERS.md](MODEL_SWAP_CHAT_TIERS.md)** | Model mapping by tier (Guest/Free/Pro): gpt-4o-mini, gpt-5-mini, gpt-5.1. Env overrides, revert steps. |

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
| **[AI_TEST_SUITE_BREAKDOWN.md](AI_TEST_SUITE_BREAKDOWN.md)** | Full AI test suite: run/batch API, validators, prompt systems, DB schema, admin UI, expected checks. |
| **[AI_TEST_V3_V4_WIRING.md](AI_TEST_V3_V4_WIRING.md)** | V3/V4 model-backed suites: wiring status, run route 501, model-runner stubs, deck injection options. |

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
