# Format Support Matrix

Last reviewed: 2026-05-11

This is the canonical truth table for ManaTap website/backend format support. It is intentionally stricter than our broad legality helpers: a format only counts as "full" when the import, validation, AI, and tool flows are all first-class together.

Code source of truth:
- `frontend/lib/deck/formatSupportMatrix.ts`
- `frontend/lib/deck/formatRules.ts`

## Support levels

- `full`: supported across the main deck-analysis and deck-tool flows
- `limited`: some helper logic exists, but one or more major flows are not first-class yet

## Matrix

| Format | Level | Import parsing | Legality | AI analysis | Roast | Cost to finish | Mulligan | Sideboard-aware | Commander logic | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Commander | full | yes | yes | yes | yes | yes | yes | no | yes | Flagship format. Color identity and singleton assumptions are first-class. |
| Modern | full | yes | yes | yes | yes | yes | yes | yes | no | Full 60-card constructed support. |
| Pioneer | full | yes | yes | yes | yes | yes | yes | yes | no | Full 60-card constructed support. |
| Standard | full | yes | yes | yes | yes | yes | yes | yes | no | Full 60-card constructed support. |
| Pauper | full | yes | yes | yes | yes | yes | yes | yes | no | Verified on the same first-class paths as other 60-card formats. |
| Legacy | limited | yes | yes | no | no | no | no | no | no | Legality mapping exists, but core AI/tool flows are not first-class. |
| Vintage | limited | yes | yes | no | no | no | no | no | no | Legality mapping exists, but core AI/tool flows are not first-class. |
| Brawl | limited | yes | yes | no | no | no | no | no | yes | Commander-style color identity helper exists, but deeper flows are not first-class. |
| Historic | limited | yes | yes | no | no | no | no | no | no | Legality mapping exists, but core AI/tool flows are not first-class. |

## Current product promise

For now, the truthful external promise should be:

- Commander is the flagship format.
- Modern, Pioneer, Standard, and Pauper are fully supported for core deck-analysis and deck-tool flows.
- Other formats may be recognized by legality helpers or import parsing, but deeper AI and deck-tool flows are still limited.

## Notes

- "Import parsing" here means the decklist parser can usually read the text/CSV shape. It does **not** imply the rest of the pipeline is fully format-aware.
- "Legality" here means we can map the format to Scryfall legality keys and related helper checks.
- "Mulligan" means the dedicated mulligan advice/simulation flow supports the format. Commander-specific rules like the free first mulligan remain Commander-only.
- Chat has one intentional special case: when no format is supplied at all, it remains Commander-first because that is ManaTap's legacy/default conversation path. Explicit limited or unrecognized formats must not silently become Commander.
