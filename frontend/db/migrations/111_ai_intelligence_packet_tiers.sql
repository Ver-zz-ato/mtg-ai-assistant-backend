-- ManaTap AI intelligence packet + confirmed memory foundation.
-- Safe/idempotent: reconciles live schema drift and adds V1 tables used by server-side AI grounding.

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
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own chat deck change proposals" ON public.chat_deck_change_proposals;
CREATE POLICY "Users can create own chat deck change proposals"
ON public.chat_deck_change_proposals
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own chat deck change proposals" ON public.chat_deck_change_proposals;
CREATE POLICY "Users can update own chat deck change proposals"
ON public.chat_deck_change_proposals
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.deck_intelligence_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_hash text NOT NULL,
  version text NOT NULL,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('guest', 'free', 'pro')),
  packet jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(deck_id, deck_hash, version, tier)
);

CREATE INDEX IF NOT EXISTS deck_intelligence_cache_deck_idx
  ON public.deck_intelligence_cache(deck_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS deck_intelligence_cache_user_idx
  ON public.deck_intelligence_cache(user_id, updated_at DESC);

ALTER TABLE public.deck_intelligence_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only deck intelligence cache"
ON public.deck_intelligence_cache
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.deck_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id uuid NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'deck' CHECK (scope IN ('user', 'deck', 'format')),
  memory_type text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed', 'archived')),
  source_thread_id uuid NULL REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  source_message_id bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS deck_memories_user_status_idx
  ON public.deck_memories(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS deck_memories_deck_idx
  ON public.deck_memories(deck_id, status, created_at DESC);

ALTER TABLE public.deck_memories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.deck_memories TO authenticated;

DROP POLICY IF EXISTS "Users can read own deck memories" ON public.deck_memories;
CREATE POLICY "Users can read own deck memories"
ON public.deck_memories
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own deck memories" ON public.deck_memories;
CREATE POLICY "Users can create own deck memories"
ON public.deck_memories
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own deck memories" ON public.deck_memories;
CREATE POLICY "Users can update own deck memories"
ON public.deck_memories
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.combo_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug text NOT NULL DEFAULT 'manatap_local',
  combo_name text NOT NULL,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  note text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_slug, combo_name)
);

CREATE INDEX IF NOT EXISTS combo_catalog_enabled_idx
  ON public.combo_catalog(enabled, source_slug);

ALTER TABLE public.combo_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only combo catalog"
ON public.combo_catalog
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
