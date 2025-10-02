-- 023_ai_persona_analytics.sql
-- Persona analytics support: columns, indexes, and reporting views
-- Safe to run multiple times (uses IF NOT EXISTS where supported)

-- 1) Extend ai_usage with persona_id (text) and teaching (boolean)
ALTER TABLE IF EXISTS public.ai_usage
  ADD COLUMN IF NOT EXISTS persona_id text,
  ADD COLUMN IF NOT EXISTS teaching boolean;

-- 2) Helpful indexes for analytics filtering/grouping
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'ai_usage_created_at_idx'
  ) THEN
    CREATE INDEX ai_usage_created_at_idx ON public.ai_usage (created_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'ai_usage_persona_created_idx'
  ) THEN
    CREATE INDEX ai_usage_persona_created_idx ON public.ai_usage (persona_id, created_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'ai_usage_user_created_idx'
  ) THEN
    CREATE INDEX ai_usage_user_created_idx ON public.ai_usage (user_id, created_at);
  END IF;
END $$;

-- 3) Daily rollup view by persona (for charts)
CREATE OR REPLACE VIEW public.ai_persona_usage_daily AS
SELECT
  date_trunc('day', created_at) AS day,
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  COUNT(*)                           AS messages,
  SUM(input_tokens)::bigint          AS input_tokens,
  SUM(output_tokens)::bigint         AS output_tokens,
  ROUND(SUM(cost_usd)::numeric, 6)   AS cost_usd,
  COUNT(DISTINCT user_id)            AS unique_users
FROM public.ai_usage
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 4) 30d summary by persona
CREATE OR REPLACE VIEW public.ai_persona_usage_30d AS
SELECT
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  COUNT(*)                           AS messages,
  SUM(input_tokens)::bigint          AS input_tokens,
  SUM(output_tokens)::bigint         AS output_tokens,
  ROUND(SUM(cost_usd)::numeric, 6)   AS cost_usd,
  COUNT(DISTINCT user_id)            AS unique_users
FROM public.ai_usage
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY messages DESC;

-- 5) Optional seed for persona config in app_config (no-op if already set)
INSERT INTO public.app_config (key, value)
VALUES (
  'ai.persona.seeds',
  '{
    "baseline": "You are ManaTap AI — a concise, trustworthy MTG assistant. Prefer bullet lists and short steps.",
    "format": {
      "commander": "Commander persona: Respect 100-card singleton and commander color identity. Emphasize synergy and politics.",
      "modern": "Modern persona: Focus on efficiency and meta resilience.",
      "standard": "Standard persona: Only Standard-legal; mention recent sets."
    },
    "plan": {
      "budget": "Budget persona: Prefer cheaper swaps and recent reprints; offer at least one budget alternative.",
      "luxury": "Luxury persona: OK to include premium upgrades where they improve consistency.",
      "optimized": "Optimized persona: Balance power and cost."
    },
    "teaching": "Teaching persona: Briefly define jargon the first time; keep explanations one sentence each."
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;