-- db/sql/010_chat_history.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_id uuid NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_threads_owner_rw ON public.chat_threads;
CREATE POLICY chat_threads_owner_rw ON public.chat_threads
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_owner_rw ON public.chat_messages;
CREATE POLICY chat_messages_owner_rw ON public.chat_messages
USING (
  EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
);

COMMIT;
