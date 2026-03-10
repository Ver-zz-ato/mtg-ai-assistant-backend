-- User chat preferences (Pro cross-thread memory)
-- Stores format, budget, colors, playstyle that Pro users can save and have injected into every chat

CREATE TABLE IF NOT EXISTS public.user_chat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format TEXT,
  budget TEXT,
  colors TEXT[] DEFAULT '{}',
  playstyle TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_chat_preferences_user_id ON public.user_chat_preferences(user_id);

ALTER TABLE public.user_chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own chat preferences"
  ON public.user_chat_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat preferences"
  ON public.user_chat_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat preferences"
  ON public.user_chat_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_chat_preferences IS 'Pro feature: saved format/budget/colors/playstyle injected into chat system prompt';
