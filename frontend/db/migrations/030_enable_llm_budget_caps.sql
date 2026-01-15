-- Enable LLM budget caps
-- Task 8: Create budget cap configuration SQL
-- Sets default budget caps: $1/day, $5/week
-- Budget enforcement already exists in code (frontend/app/api/chat/route.ts lines 164-180)

INSERT INTO app_config (key, value) 
VALUES ('llm_budget', '{"daily_usd": 1.0, "weekly_usd": 5.0}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
