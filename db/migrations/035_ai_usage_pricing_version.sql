-- Add pricing_version to ai_usage for reconciliation when pricing table changes.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS pricing_version TEXT NULL;
