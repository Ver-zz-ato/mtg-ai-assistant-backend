# Audit: `scryfall_cache.name` vs Scryfall `default_cards` (read-only)

**Script:** `frontend/scripts/audit-scryfall-cache-names.mjs`

**Purpose:** List every `public.scryfall_cache.name` that does **not** appear as a canonical oracle name in the **latest** Scryfall `default_cards` bulk file (after `normalizeScryfallCacheName`, lockstep with `frontend/lib/server/scryfallCacheRow.ts`).

**Safety:** Read-only. No Supabase writes, no API route, no app changes.

## Run

From `frontend/`:

```bash
npm run audit:scryfall-cache-names
```

Or:

```bash
node scripts/audit-scryfall-cache-names.mjs
```

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes* | Or `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Read-only `SELECT name` on `scryfall_cache` |

\* Loads `frontend/.env.local` and repo `.env` if present (does not override existing env).

Optional output paths:

- `SCRYFALL_NAME_AUDIT_OUT_JSON`
- `SCRYFALL_NAME_AUDIT_OUT_CSV`

CLI: `--out-json=path`, `--out-csv=path`

## Outputs

Default (under `frontend/tmp/`):

- `scryfall-cache-name-audit.json` — full report + `unmatched[]` with `{ name, category }`
- `scryfall-cache-name-audit-unmatched.csv`

## Preview-only cleanup mapper (no DB writes)

After generating `tmp/scryfall-cache-name-audit.json`, run:

```bash
npm run preview:scryfall-cache-cleanup
```

**Script:** `frontend/scripts/preview-scryfall-cache-cleanup.mjs`

**Reads:** `tmp/scryfall-cache-name-audit.json` (`unmatched[]`).

**Re-downloads** latest `default_cards` to rebuild the canonical name set (same as audit; required because the audit JSON does not list all canonical names). Optional `--skip-bulk-download --canonical-json=path` if you supply a JSON array of normalized names.

**Writes:** `tmp/scryfall-cache-cleanup-preview.json` and `.csv` — each row includes:

- `proposed_action`, `proposed_target_name`, `confidence`, `reason`
- `repair_pass`: `1` | `2` | empty
- `matched_by_rule`: e.g. `pass1:cumulative_after:strip_outer_quotes`, `pass2:face_resolve:unique_raw`, `delete:heuristic`, `manual:none`

**Summary** in JSON: `repair_pass_1`, `repair_pass_2`, `repair_to_canonical_total`, `delete_candidate`, `manual_review`, plus `faceToFullMapSize` when bulk was loaded.

### Pass 1 (unchanged core)

Cumulative pipeline: trim, outer quotes, `[[…]]`, leading dash, qty / stuck digits, `(set) n`, `,n`, type tags `[commander]` etc. (two full passes of the micro-steps). Plus single-step fallbacks and a fixed combo path.

### Pass 2 (second pass)

Applied only if pass 1 does not match. Steps (run twice in sequence like pass 1):

1. **Trailing USD price** — e.g. `blood moon $8.49`
2. **Trailing collector + rarity** — e.g. `… 0137 r`, `… 0299 c`
3. **Foil markers** — trailing `*f*`, `★`, `☆`
4. **Deck role tags** — trailing `[ramp]`, `[draw]`, `[removal]`, … (see `ROLE_TAGS` in script)
5. **Single slash → MDFC** — first ` / ` → ` // ` when the string has no `//` yet

After **each** micro-step, the script checks against the canonical **set** and a **face→full** map (see below).

**Pre-pass:** `normalizeCurlyQuotesAndSpaces` (curly quotes → straight, nbsp → space) before pass 1.

### Face → full card (unique only)

From the same `default_cards` array, for each card with `card_faces`, each face `name` (normalized) maps to that card’s top-level `name` (normalized). If the same face string appears on **more than one** distinct full oracle name, the face is **omitted** (ambiguous). Only **unique** mappings are used for auto-repair.

### Delete candidates (conservative)

Tag-only rows, leading `//`, obvious multi-word prompts (e.g. “please analyze…”, “analyze this commander deck…”), empty / punctuation-only. **Not** used for “weird but real” card names.

**Safety:** Read-only for Supabase; local files only.

## SQL write plan preview (still no DB writes)

After `scryfall-cache-cleanup-preview.json` exists, generate a **review-only** merge/rename/delete plan + `BEGIN` … `ROLLBACK` SQL:

```bash
npm run preview:scryfall-cache-sql-plan
```

**Script:** `frontend/scripts/preview-scryfall-cache-sql-plan.mjs`

**Reads:** cleanup preview JSON + `SELECT *` on `scryfall_cache` for involved PKs.

**Writes locally:** `frontend/tmp/scryfall-cache-sql-plan.json`, `.csv`, `.sql`, and `db/SCRYFALL_CACHE_CLEANUP_SQL_PREVIEW.md` (summary).

**Safety:** Does not execute SQL; no Supabase mutations.

### Final-safe plan after a committed batch

Uses **current** `scryfall-cache-name-audit.json` (unmatched PKs) **and** cleanup preview: only rows whose `original_name` is still in the audit’s `unmatched` list are eligible (excludes already-deleted/fixed keys). Writes `tmp/scryfall-cache-sql-plan-final-safe.sql` (ends with `ROLLBACK;`) + `tmp/scryfall-cache-sql-plan-final-safe.json`.

```bash
npm run preview:scryfall-cache-sql-plan-final-safe
```

### Last repair rows only (tiny preview)

When only a handful of `repair_to_canonical` rows remain, generate a minimal `BEGIN` … `ROLLBACK` SQL file (merge + delete + optional rename):

```bash
npm run preview:scryfall-cache-sql-plan-last-3
```

**Script:** `frontend/scripts/preview-scryfall-cache-sql-plan-last-repairs.mjs` — default output `tmp/scryfall-cache-sql-plan-last-3.sql` (+ `.json`).

### Delete preview — partial bracket pollution (read-only)

From `tmp/scryfall-cache-name-audit.json`, selects `unmatched[]` with `category === "partial_bracket_pollution"` and writes a single `DELETE ... WHERE name IN (...)` preview (exact PK only; no `LIKE`). Ends with `ROLLBACK;`.

```bash
npm run preview:scryfall-cache-delete-partial-brackets
```

**Outputs:** `tmp/scryfall-cache-delete-partial-brackets.sql`, `tmp/scryfall-cache-delete-partial-brackets.json` (full name list). Does not execute SQL or connect to the database.

### Cleanup preview — `csv_pollution` bucket only

Classifies audit rows with `category === "csv_pollution"` into `repair_to_canonical` / `delete_candidate` / `manual_review` using CSV-specific strips (budget/price, comma segments, dash-title junk) plus the same canonical/face repair passes as the main cleanup preview. **No DB writes.**

```bash
npm run preview:scryfall-cache-csv-pollution
```

**Outputs:** `tmp/scryfall-cache-preview-csv-pollution.json`, `tmp/scryfall-cache-preview-csv-pollution.csv`

### Cleanup preview — `bracketed_name` bucket only

Classifies audit rows with `category === "bracketed_name"` using outer quote removal, `[[...]]` stripping, trailing commas, canonical normalization, and exact oracle match (plus optional unique face→full). **No DB writes.**

```bash
npm run preview:scryfall-cache-bracketed-name
```

**Outputs:** `tmp/scryfall-cache-preview-bracketed-name.json`, `tmp/scryfall-cache-preview-bracketed-name.csv`

### Cleanup preview — `import_set_number_junk` bucket only

Classifies rows with `category === "import_set_number_junk"`: strips trailing `(set) 123` / `123a` / `★`, normalizes single ` / ` → ` // ` for MDFC, then exact oracle match + optional unique face→full. **No DB writes.**

```bash
npm run preview:scryfall-cache-import-set-number-junk
```

**Outputs:** `tmp/scryfall-cache-preview-import-set-number-junk.json`, `tmp/scryfall-cache-preview-import-set-number-junk.csv`

### SQL plan — `import_set_number_junk` safe subset (read-only)

After `scryfall-cache-preview-import-set-number-junk.json` exists, build merge/rename preview from live `scryfall_cache` for **`repair_to_canonical` only** (skips preview repairs whose bad PK is not in DB).

```bash
npm run preview:scryfall-cache-sql-plan-import-set-number-junk-safe
```

**Outputs:** `tmp/scryfall-cache-sql-plan-import-set-number-junk-safe.sql` (ends with `ROLLBACK;`), `tmp/scryfall-cache-sql-plan-import-set-number-junk-safe.json`. Does not execute SQL.

### SQL plan — `bracketed_name` safe subset (read-only)

After `scryfall-cache-preview-bracketed-name.json` exists, build merge/rename preview from live `scryfall_cache` for **`repair_to_canonical` only** (skips preview repairs whose bad PK is not in DB).

```bash
npm run preview:scryfall-cache-sql-plan-bracketed-name-safe
```

**Outputs:** `tmp/scryfall-cache-sql-plan-bracketed-name-safe.sql` (ends with `ROLLBACK;`), `tmp/scryfall-cache-sql-plan-bracketed-name-safe.json`. Does not execute SQL.

### SQL plan — csv_pollution safe subset (read-only)

After `scryfall-cache-preview-csv-pollution.json` exists, build merge/rename/delete preview from live `scryfall_cache` (repair + `delete_candidate` only; no `manual_review`):

```bash
npm run preview:scryfall-cache-sql-plan-csv-pollution-safe
```

**Outputs:** `tmp/scryfall-cache-sql-plan-csv-pollution-safe.sql` (ends with `ROLLBACK;`), `tmp/scryfall-cache-sql-plan-csv-pollution-safe.json`. Does not execute SQL.

### AI-assisted review export (read-only)

After `scryfall-cache-name-audit.json` and `scryfall-cache-cleanup-preview.json` exist, build a compact JSON + CSV + prompt for a high-level model to suggest `repair_to_canonical` / `delete_candidate` / `manual_keep` / `unsure`. **No Supabase, no SQL, no auto-fix.**

- Default export: **manual_review + delete_candidate** only (excludes deterministic `repair_to_canonical` rows). Use `--include-repairs` to export all unmatched rows.
- Loads latest `default_cards` unless `--skip-bulk-download --canonical-json=path` (then candidate lists are empty).

```bash
npm run export:scryfall-cache-ai-review
```

**Outputs:** `tmp/scryfall-cache-ai-review-input.json`, `tmp/scryfall-cache-ai-review-summary.csv`, `tmp/scryfall-cache-ai-review-prompt.txt`

### AI-reviewed cleanup SQL preview (read-only)

### Deterministic repairs only — cleanup preview (read-only)

From `tmp/scryfall-cache-cleanup-preview.json` (rows with `proposed_action === "repair_to_canonical"` only; no `manual_review`). Same merge/rename/rollback pattern as AI-safe; normalized PKs; read-only Supabase.

```bash
npm run generate:preview-scryfall-cache-cleanup-repairs-safe
```

**Outputs:** `db/preview_scryfall_cache_cleanup_preview_repairs_safe.sql`, `db/preview_scryfall_cache_cleanup_preview_repairs_safe.json`

**Preferred (normalized PK + merge/rename):** After `tmp/scryfall-cache-ai-reviewed.json` exists, run the **safe** generator. It applies `normalizeScryfallCacheName` to AI `proposed_target_name` (never display-case in `name`/`name_norm`), **SELECT**s `scryfall_cache` read-only to choose **merge_then_delete_bad_row** vs **rename_row_to_canonical**, writes sections A–E + `ROLLBACK`. **Does not execute SQL.**

```bash
npm run generate:preview-scryfall-cache-ai-cleanup-safe
```

**Outputs:** `db/preview_scryfall_cache_ai_cleanup_safe.sql`, `db/preview_scryfall_cache_ai_cleanup_safe.json` (summary + `sample_mappings`).

Requires `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same as other SQL plan previews).

**Legacy (deprecated):** `npm run generate:preview-scryfall-cache-ai-cleanup-sql` → `db/preview_scryfall_cache_ai_cleanup.sql` used display-case `SET name` and is **not** valid for this PK scheme.

If `delete_candidate` rows omit `confidence`, they are excluded until marked `high`.

### Remaining rows — rich AI review export (read-only)

For **current** unmatched names from `tmp/scryfall-cache-name-audit.json`: loads full `scryfall_cache` rows from Supabase, latest `default_cards`, deterministic + word-overlap candidates (max 3), DB presence per candidate, heuristic action. **No writes.**

```bash
npm run export:scryfall-cache-remaining-ai-review
```

**Outputs:** `tmp/scryfall-cache-remaining-ai-review.json`, `.csv`, `-prompt.txt`

**Conservative reviewed JSON (optional):** After the export exists, build `tmp/scryfall-cache-remaining-ai-reviewed.json` — only assigns `merge_then_delete_bad_row` / `rename_row_to_canonical` / `delete_candidate` when match quality is truly high (deterministic exact/face, not word-overlap; obvious junk for deletes). Otherwise `keep_real` or `unsure`.

```bash
npm run build:scryfall-cache-remaining-ai-reviewed
```

### Remaining rows — SQL preview from AI-reviewed JSON (read-only)

After you produce `tmp/scryfall-cache-remaining-ai-reviewed.json` (or equivalent) with `merge_then_delete_bad_row` / `rename_row_to_canonical` / `delete_candidate`, generates merged preview SQL (`BEGIN`/`ROLLBACK`). Merge vs rename is **re-checked** against live DB. Optional `--high-confidence-only`.

```bash
npm run generate:preview-scryfall-cache-remaining-ai-reviewed-sql
```

**Outputs:** `db/preview_scryfall_cache_remaining_ai_reviewed.sql`, `db/preview_scryfall_cache_remaining_ai_reviewed.json`

### Final small-bucket pass — quoted / bracketed / import-set junk (read-only)

Narrow review for **`quoted_name`**, **`bracketed_name`**, **`import_set_number_junk`** only (excludes `unknown`, `csv_pollution`). Reads latest audit + `scryfall-cache-remaining-ai-review.json` + optional `scryfall-cache-remaining-ai-reviewed.json`; conservative merge/rename only when rank-1 candidate is `exact_pipeline` or `face_match` (not word-overlap). Writes review JSON + preview SQL.

```bash
npm run generate:scryfall-cache-final-small-bucket
```

**Outputs:** `tmp/scryfall-cache-final-small-bucket-review.json`, `db/preview_scryfall_cache_final_small_bucket.sql`, `db/preview_scryfall_cache_final_small_bucket.json`

## Caveats

- **Memory:** Loads the full `default_cards` JSON array into memory (practical for local/operator runs).
- **Legitimate odd names:** Alchemy `a-` prefixes, MDFC ` // ` names, stickers, etc. **can** appear in bulk; if something is still “unmatched”, it may be legacy/junk **or** a bulk-vs-DB timing skew — classification buckets are heuristics only.
- **Normalization** is duplicated in the `.mjs` file to match `normalizeScryfallCacheName` exactly (see script comment). If the TS function changes, update the script in lockstep.
- **Preview mapper** uses heuristic transforms and delete hints; always review before any future DB change.
