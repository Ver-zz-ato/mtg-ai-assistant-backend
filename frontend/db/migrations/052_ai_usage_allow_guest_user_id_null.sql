-- Allow ai_usage.user_id to be NULL for guest users.
-- Guests pass user_id: null; NOT NULL constraint would cause silent insert failures.
-- Safe to run: DROP NOT NULL on already-nullable column is a no-op.

ALTER TABLE public.ai_usage ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.ai_usage.user_id IS 'User ID when authenticated; NULL for guest users (scoped by guest_session_token hash).';
