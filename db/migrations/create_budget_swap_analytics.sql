-- Create budget_swap_analytics table for tracking budget swap savings
CREATE TABLE IF NOT EXISTS budget_swap_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  deck_name TEXT,
  original_card TEXT NOT NULL,
  swapped_card TEXT NOT NULL,
  original_price NUMERIC(10, 2) DEFAULT 0,
  swapped_price NUMERIC(10, 2) DEFAULT 0,
  savings NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS idx_budget_swap_analytics_user_id ON budget_swap_analytics(user_id);

-- Add index for deck lookups
CREATE INDEX IF NOT EXISTS idx_budget_swap_analytics_deck_id ON budget_swap_analytics(deck_id);

-- Add RLS policies
ALTER TABLE budget_swap_analytics ENABLE ROW LEVEL SECURITY;

-- Users can view their own swap analytics
CREATE POLICY "Users can view their own swap analytics"
  ON budget_swap_analytics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own swap analytics
CREATE POLICY "Users can insert their own swap analytics"
  ON budget_swap_analytics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own swap analytics
CREATE POLICY "Users can delete their own swap analytics"
  ON budget_swap_analytics
  FOR DELETE
  USING (auth.uid() = user_id);

