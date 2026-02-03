-- Add per-request tracking: route and truncated prompt/response for admin visibility.
-- Backwards compatible: all new columns nullable.

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS route TEXT NULL;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS prompt_preview TEXT NULL;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS response_preview TEXT NULL;
