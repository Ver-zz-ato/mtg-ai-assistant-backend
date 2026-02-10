-- Dedicated audit table for admin config changes (before/after diffs).
-- Supabase: public.admin_audit_log. Existing admin_audit remains for other actions.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  payload_json JSONB NULL
);

COMMENT ON TABLE public.admin_audit_log IS 'Config change audit: payload_json holds { key, before, after } for config_set';
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log (action, created_at DESC);
