-- Add deck_aim field to decks table for storing AI-inferred or user-edited deck strategy/aim
-- This helps the AI understand the deck's goal and provide better recommendations

ALTER TABLE public.decks 
ADD COLUMN IF NOT EXISTS deck_aim TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.decks.deck_aim IS 'AI-inferred or user-edited description of the deck strategy/aim/goal. Helps AI provide better recommendations.';
