-- Add prompt-path and model-tier columns to ai_usage for instrumentation (Part B).
-- Backwards compatible: all new columns are nullable.

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS prompt_path TEXT;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS prompt_version_id UUID NULL;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS modules_attached_count INT NULL;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS format_key TEXT NULL;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS model_tier TEXT NULL;
