-- Create user_ai_examples table for few-shot learning
CREATE TABLE IF NOT EXISTS user_ai_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  feedback TEXT CHECK (feedback IN ('positive', 'negative', 'neutral')),
  category TEXT, -- e.g., 'format', 'archetype', 'question_type'
  tags TEXT[], -- Additional tags for matching
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_ai_examples_user_id ON user_ai_examples(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_examples_feedback ON user_ai_examples(feedback) WHERE feedback = 'positive';
CREATE INDEX IF NOT EXISTS idx_user_ai_examples_category ON user_ai_examples(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_ai_examples_tags ON user_ai_examples USING GIN(tags);

-- Enable RLS
ALTER TABLE user_ai_examples ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own examples
CREATE POLICY "Users can view own examples"
  ON user_ai_examples FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own examples
CREATE POLICY "Users can insert own examples"
  ON user_ai_examples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own examples
CREATE POLICY "Users can update own examples"
  ON user_ai_examples FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own examples
CREATE POLICY "Users can delete own examples"
  ON user_ai_examples FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_ai_examples IS 'Stores user feedback examples for few-shot learning';

