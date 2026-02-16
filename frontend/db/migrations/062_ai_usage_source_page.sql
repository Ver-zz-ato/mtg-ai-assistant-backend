-- Add source_page to ai_usage for deck_analyze call attribution.
-- Enables analytics: "Deck Analyze from homepage" vs "Deck page AI health" vs "Build assistant" etc.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS source_page TEXT NULL;

COMMENT ON COLUMN public.ai_usage.source_page IS 'Where the AI call originated: deck_page_analyze, deck_page_health, homepage, build_assistant, profile, etc.';
