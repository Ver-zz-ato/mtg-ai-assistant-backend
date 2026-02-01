# MTG Prompt System: Version and Implementation Breakdown

This document describes the current prompt system so an LLM or developer can understand how prompts are built, versioned, and used.

**Related:** [Thin prompt / thick validator](thin_prompt_thick_validator.md) — architecture (prompts guide judgment; code enforces correctness) and fallback phase-out strategy.

---

## 1. Two parallel systems

The app uses **two** prompt sources; routes choose between them at runtime:

| System | Storage | Used when |
|--------|---------|-----------|
| **3-layer composition** | `prompt_layers` table | Primary: `composeSystemPrompt()` succeeds |
| **Monolithic versions** | `prompt_versions` + `app_config` | Fallback: when composition fails or no deck context |

**Routes:** Chat (stream + non-stream) and deck/analyze **prefer** 3-layer composition, then fall back to `getPromptVersion(kind)` and finally to a hardcoded default.

---

## 2. 3-layer composition (primary)

### 2.1 Tables

- **`prompt_layers`** (current editable content)
  - `key` (TEXT, PK): layer identifier
  - `body` (TEXT): prompt text
  - `meta` (JSONB): e.g. `{"source":"...", "description":"..."}`
  - `updated_at` (TIMESTAMPTZ)

- **`prompt_layer_versions`** (append-only history)
  - `id` (UUID), `layer_key`, `body`, `meta`, `created_at`
  - Used for history/audit; not used during composition.

### 2.2 Layer keys and order

Composition order is fixed:

1. **BASE (always)**  
   - Key: `BASE_UNIVERSAL_ENFORCEMENT`  
   - Content: global rules, failure conditions, ADD/CUT, evidence, synergy chains, SILENT RULES, human-friendly output template, etc.  
   - One row; shared by all formats.

2. **FORMAT (one per format)**  
   - Keys: `FORMAT_COMMANDER`, `FORMAT_STANDARD`, `FORMAT_MODERN`, `FORMAT_PIONEER`, `FORMAT_PAUPER`  
   - Picked by `formatKey` (normalized to one of these).  
   - Default format is `commander` if missing or invalid.

3. **MODULES (optional, deck-dependent)**  
   - Keys: `MODULE_CASCADE`, `MODULE_ARISTOCRATS`, `MODULE_LANDFALL`, `MODULE_SPELLSLINGER_STORM`, `MODULE_GRAVEYARD_RECURSION`  
   - Attached only when **deck context is present** and module detection says so (see below).  
   - Multiple modules can attach (e.g. Commander + graveyard deck → BASE + FORMAT_COMMANDER + MODULE_GRAVEYARD_RECURSION).

### 2.3 Composition logic

**File:** `frontend/lib/prompts/composeSystemPrompt.ts`

- **Input:** `formatKey` (string), optional `deckContext` (`deckCards`, `commanderName`, `colorIdentity`, `deckId`), optional `supabase`.
- **Steps:**
  1. Load BASE: `prompt_layers` where `key = 'BASE_UNIVERSAL_ENFORCEMENT'`.
  2. Load FORMAT: `prompt_layers` where `key = 'FORMAT_<UPPERCASE_FORMAT>'` (e.g. `FORMAT_COMMANDER`).
  3. If `deckContext?.deckCards?.length`:
     - Call `getDetailsForNamesCacheOnly(deck card names)` (Scryfall cache, type_line + oracle_text only).
     - Call `detectModules(deckCards, cachedCardDataByName, commanderName)`.
     - For each returned module key, load `prompt_layers` by that key and append body.
  4. Concatenate: `BASE + "\n\n" + FORMAT + "\n\n" + MODULE_1 + "\n\n" + ...`
- **Output:** `{ composed: string, modulesAttached: string[] }`.
- **Decklist:** Not injected here. The **route** appends a separate “DECK CONTEXT” block (decklist, commander, format, etc.) after composition.
- **DB client:** Prefers service-role/admin client for `prompt_layers` (RLS); falls back to passed supabase or `getServerSupabase()`.

### 2.4 Module detection

**File:** `frontend/lib/prompts/moduleDetection.ts`

- **Input:** `deckCards`, a map of card name → `{ type_line?, oracle_text? }` (from cache only), optional `commanderName`.
- **Output:** `{ flags: ModuleFlags, modulesAttached: string[] }`.

**Logic (simplified):**

- **Cascade:** ≥5 cards with “cascade” in oracle, or commander has cascade → `MODULE_CASCADE`.
- **Aristocrats:** Sac outlets + death payoffs above thresholds → `MODULE_ARISTOCRATS`.
- **Landfall:** Landfall payoffs or extra land drops above thresholds → `MODULE_LANDFALL`.
- **Spellslinger/Storm:** High instant/sorcery count or storm in oracle → `MODULE_SPELLSLINGER_STORM`.
- **Graveyard:** Commander in graveyard-commander set, OR ≥6 recursion/self-mill cards, OR ≥3 name-only enablers (e.g. Buried Alive, Victimize) → `MODULE_GRAVEYARD_RECURSION`.

Constants (e.g. `CASCADE_MIN_COUNT`, `GRAVEYARD_ENABLER_NAMES`) are in `moduleDetection.ts`. Detection uses **cached** data only (no live Scryfall in this path).

---

## 3. Monolithic version system (fallback)

### 3.1 Tables

- **`prompt_versions`**
  - `id` (UUID), `version` (string), `kind` (e.g. `'chat'` | `'deck_analysis'`), `system_prompt` (TEXT), `meta`, `created_at`.
  - Full system prompt per “kind” (chat vs deck_analysis).

- **`app_config`**
  - `key`, `value` (JSONB).
  - Active version per kind: `key = 'active_prompt_version_chat'` or `'active_prompt_version_deck_analysis'`, `value = { id: "<uuid of prompt_versions row>" }`.

### 3.2 Loading the active version

**File:** `frontend/lib/config/prompts.ts`

- **`getPromptVersion(kind, supabase?)`** (async):
  1. Read `app_config` for `active_prompt_version_<kind>` → get `value.id`.
  2. Load `prompt_versions` by that id and kind → return `{ id, version, system_prompt }`.
  3. If no active set: use latest row in `prompt_versions` for that kind (by `created_at`).
  4. If still none: optional legacy read from `app_config.key = 'prompts'` (templates.system).
  5. Return null if nothing found.

- **`getActivePromptVersion()`** (sync): Returns a stub string (e.g. `"v1"`) for backward compatibility; real version is resolved asynchronously via `getPromptVersion`.

---

## 4. Where each route gets the system prompt

### 4.1 Chat stream (`/api/chat/stream`)

1. Try `composeSystemPrompt({ formatKey, deckContext: deckContextForCompose, supabase })` → `sys = composed`.
2. On failure: `getPromptVersion("chat", supabase)` → `sys = promptVersion.system_prompt`, set `promptVersionId`.
3. If still no sys: hardcoded default string.
4. Then append: user preferences (format, colors, etc.), **DECK CONTEXT** block (if linked or pasted decklist), thread/pasted-deck context, final formatting line.

### 4.2 Chat non-stream (`/api/chat/route.ts`)

1. Initial `sys` = default (short ManaTap + bold card rule).
2. Try `composeSystemPrompt({ formatKey, deckContext: deckContextForCompose, supabase })` → `sys = composed`.
3. On failure: `getPromptVersion("chat", supabase)` → `sys = promptVersion.system_prompt`, `promptVersionId`.
4. If still no sys: keep or set fallback default.
5. Then append: DECK CONTEXT (if deck), pasted decklist context, RAG, conversation summary, preferences, etc.

### 4.3 Deck analyze (`/api/deck/analyze`)

1. Try `composeSystemPrompt({ formatKey, deckContext: deckContextForCompose, supabase })` → `deckAnalysisSystemPrompt = composed + suffix` (suffix adds “Output structured analysis…” and [[Card Name]]).
2. On failure: `getPromptVersion("deck_analysis", supabase)` → `deckAnalysisSystemPrompt = promptVersion.system_prompt`.
3. That prompt is used for GPT-based analysis (e.g. `generateValidatedDeckAnalysis`). Response is then validated and cleaned (e.g. `validateRecommendations`, `stripIncompleteSynergyChains`, `applyOutputCleanupFilter`).

---

## 5. Version identification in responses

- **Chat:** When fallback is used, `promptVersionId` (from `getPromptVersion`) can be stored or returned (e.g. in analytics or response meta).
- **Deck analyze:** Response can include `prompt_version` or `prompt_version_id` (from composed path or from `getPromptVersion("deck_analysis")`).
- **3-layer path:** No single “version id” is stored for the composed prompt; only `formatKey` and `modulesAttached` are logged in dev. Layer content is “current” whatever is in `prompt_layers` at request time.

---

## 6. Migrations that affect prompt content

- **`add_prompt_layers_3layer_system.sql`** – Creates `prompt_layers` and `prompt_layer_versions`, seeds BASE, FORMAT_*, MODULE_*.
- **`update_prompt_layers_no_simulation_human_friendly.sql`** – Removes hand/turn simulation from BASE, human-friendly template phrasing.
- **`add_silent_rules_and_human_output.sql`** – Appends SILENT RULES block to BASE, replaces template labels (e.g. “Why (1 sentence)” → “Why this helps:”, “Chain A (must use ONLY…)” → “Chain A (cards already in your list)”).
- **`add_base_output_template_and_fact_check.sql`** – (If present) adds/changes BASE output template and fact-check wording.

Other migrations (e.g. `evidence_based_deck_analysis_prompt.sql`, `add_enforcement_layers_to_prompts.sql`) update **`prompt_versions`** (monolithic fallback), not `prompt_layers`.

---

## 7. Summary for an LLM

- **Primary path:** System prompt = **BASE** (universal rules + human-friendly template + SILENT RULES) + **FORMAT** (one of Commander/Standard/Modern/Pioneer/Pauper) + **MODULES** (Cascade, Aristocrats, Landfall, Spellslinger/Storm, Graveyard) attached only when deck context exists and detection rules fire. Stored in **`prompt_layers`**; composed by **`composeSystemPrompt()`** in `frontend/lib/prompts/composeSystemPrompt.ts`; module selection in **`frontend/lib/prompts/moduleDetection.ts`**.
- **Fallback path:** Full prompt from **`prompt_versions`** for `chat` or `deck_analysis`, with active version chosen via **`app_config`** (`active_prompt_version_<kind>`). Loaded by **`getPromptVersion(kind)`** in `frontend/lib/config/prompts.ts`.
- **Routes:** Chat (stream + non-stream) and deck/analyze **try composed first**, then fallback, then hardcoded default. Decklist and per-request context are **appended by the route** after the composed or versioned prompt.
- **No hand/turn simulation** in current BASE; analysis is pattern-, density-, and role-based. **SILENT RULES** and human-friendly phrasing are part of BASE so the model does not leak internal rules or worksheet language in the output.
