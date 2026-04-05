# Migration 040 — `scryfall_cache.printed_name`

## Purpose

Add an optional column for the **title as printed on the specific cached JPEG** (e.g. Universes Beyond) when it differs from the oracle `name` stored as the row’s primary identifier.

## Change

- **Table:** `public.scryfall_cache`
- **Column:** `printed_name` (`text`, nullable)
- **DDL:** `ADD COLUMN IF NOT EXISTS printed_name text`

## Semantics

| Aspect | Detail |
|--------|--------|
| **Source** | Scryfall `printed_name` when it differs from oracle `name` |
| **Use** | Aligns with small/normal art for that cached print |
| **When null** | Same as `name`, or unknown / not applicable |

## SQL

See [`040_scryfall_cache_printed_name.sql`](./040_scryfall_cache_printed_name.sql).

```sql
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS printed_name text;

COMMENT ON COLUMN public.scryfall_cache.printed_name IS
  'From Scryfall printed_name when it differs from oracle PK name; matches small/normal art. Null when same as name or unknown.';
```
