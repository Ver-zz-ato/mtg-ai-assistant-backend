ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.chat_deck_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'cancelled', 'expired', 'undone')),
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  deck_hash_before text NOT NULL,
  before_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_rows jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  applied_at timestamptz,
  undone_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_deck_change_proposals_thread_idx
  ON public.chat_deck_change_proposals(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_deck_change_proposals_deck_idx
  ON public.chat_deck_change_proposals(deck_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_deck_change_proposals_user_status_idx
  ON public.chat_deck_change_proposals(user_id, status, created_at DESC);

ALTER TABLE public.chat_deck_change_proposals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.chat_deck_change_proposals TO authenticated;

DROP POLICY IF EXISTS "Users can read own chat deck change proposals" ON public.chat_deck_change_proposals;
CREATE POLICY "Users can read own chat deck change proposals"
ON public.chat_deck_change_proposals
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own chat deck change proposals" ON public.chat_deck_change_proposals;
CREATE POLICY "Users can create own chat deck change proposals"
ON public.chat_deck_change_proposals
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = deck_id AND d.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own chat deck change proposals" ON public.chat_deck_change_proposals;
CREATE POLICY "Users can update own chat deck change proposals"
ON public.chat_deck_change_proposals
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
