-- Data moat: append-only tables for behavioral learning and meta history.
-- Migration 089. No foreign keys to avoid breakage from legacy/null data.

-- A) AI suggestion outcomes (accepted/rejected/ignored)
CREATE TABLE IF NOT EXISTS public.ai_suggestion_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id TEXT NOT NULL,
  deck_id UUID NULL,
  user_id UUID NULL,
  visitor_id TEXT NULL,
  suggested_card TEXT NULL,
  replaced_card TEXT NULL,
  category TEXT NULL,
  prompt_version_id TEXT NULL,
  format TEXT NULL,
  commander TEXT NULL,
  accepted BOOLEAN NULL,
  rejected BOOLEAN NULL,
  ignored BOOLEAN NULL,
  outcome_source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_suggestion_id ON public.ai_suggestion_outcomes (suggestion_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_deck_id ON public.ai_suggestion_outcomes (deck_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_user_id ON public.ai_suggestion_outcomes (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_outcomes_created_at ON public.ai_suggestion_outcomes (created_at DESC);

ALTER TABLE public.ai_suggestion_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.ai_suggestion_outcomes FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.ai_suggestion_outcomes IS 'Append-only log of AI suggestion outcomes (accepted/rejected/ignored) for behavioral learning.';

-- B) Meta signals history (daily snapshots)
CREATE TABLE IF NOT EXISTS public.meta_signals_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  signal_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_meta_signals_history_snapshot_date ON public.meta_signals_history (snapshot_date DESC);

ALTER TABLE public.meta_signals_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.meta_signals_history FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meta_signals_history IS 'Daily append-only snapshots of meta_signals for trend analysis.';

-- C) Commander aggregates history (daily snapshots)
CREATE TABLE IF NOT EXISTS public.commander_aggregates_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  commander_slug TEXT NOT NULL,
  deck_count INTEGER NULL,
  top_cards JSONB NULL,
  recent_decks JSONB NULL,
  raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date, commander_slug)
);

CREATE INDEX IF NOT EXISTS idx_commander_aggregates_history_snapshot_date ON public.commander_aggregates_history (snapshot_date DESC);

ALTER TABLE public.commander_aggregates_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.commander_aggregates_history FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.commander_aggregates_history IS 'Daily append-only snapshots of commander_aggregates for meta evolution.';

-- D) Deck metrics snapshot (historical deck-level metrics)
CREATE TABLE IF NOT EXISTS public.deck_metrics_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL,
  deck_hash TEXT NULL,
  snapshot_date DATE NOT NULL,
  format TEXT NULL,
  commander TEXT NULL,
  land_count INTEGER NULL,
  ramp_count INTEGER NULL,
  removal_count INTEGER NULL,
  draw_count INTEGER NULL,
  curve_histogram JSONB NULL,
  archetype_tags JSONB NULL,
  synergy_diagnostics JSONB NULL,
  deck_facts JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deck_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_deck_metrics_snapshot_snapshot_date ON public.deck_metrics_snapshot (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_deck_metrics_snapshot_deck_id ON public.deck_metrics_snapshot (deck_id);

ALTER TABLE public.deck_metrics_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.deck_metrics_snapshot FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.deck_metrics_snapshot IS 'Historical deck-level metrics (one row per deck per day) for deck evolution analysis.';
