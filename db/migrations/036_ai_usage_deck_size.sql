-- Add deck_size to ai_usage for cost-by-deck-size analytics (deck analyze flows).
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS deck_size INTEGER NULL;
