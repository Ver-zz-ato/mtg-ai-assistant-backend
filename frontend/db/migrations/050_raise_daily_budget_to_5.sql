-- Raise daily AI budget from $1 to $5
-- Preserves existing weekly_usd if set

INSERT INTO app_config (key, value)
VALUES ('llm_budget', '{"daily_usd": 5.0, "weekly_usd": 5.0}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_set(COALESCE(app_config.value, '{}'::jsonb), '{daily_usd}', '5.0'::jsonb);
