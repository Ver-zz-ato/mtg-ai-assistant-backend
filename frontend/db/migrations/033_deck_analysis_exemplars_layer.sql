-- Tiny exemplar layer for composed deck analysis: posture only (~10 lines).
-- Not mixed into BASE; appended only when kind = deck_analysis.
-- 1 archetype, 1 ADD/CUT, 1 synergy chain — skimmable by stronger models.

-- Body: ~10 lines. One archetype line, one ADD/CUT, one synergy line. Posture only.
INSERT INTO prompt_layers (key, body, meta, updated_at)
VALUES (
  'DECK_ANALYSIS_EXEMPLARS',
  E'=== OUTPUT POSTURE (example shape only) ===
Archetype: This is a [archetype] deck. Win pattern: [one line]. Evidence: [[Card A]], [[Card B]].

Problems: One line per problem; cite 2–5 deck cards.

One upgrade slot: ADD [[New Card]] / CUT [[Weak Slot]]
- Fixes: P#
- Synergy (one line): [[Enabler]] does X → [[Payoff]] triggers → together [outcome].',
  '{"source":"033_deck_analysis_exemplars","description":"Tiny posture exemplar for deck_analysis composed prompt"}'::jsonb,
  now()
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  meta = EXCLUDED.meta,
  updated_at = EXCLUDED.updated_at;
