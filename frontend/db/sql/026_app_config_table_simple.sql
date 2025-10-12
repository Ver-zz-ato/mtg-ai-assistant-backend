-- 026_app_config_table_simple.sql
-- Create app_config table for storing application configuration including changelog
-- Simplified version with better PostgreSQL compatibility

-- Create app_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.app_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add helpful indexes (only if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'app_config_updated_at_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX app_config_updated_at_idx ON public.app_config (updated_at);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they're correct
DROP POLICY IF EXISTS "Public read access for public configs" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated users can read all config" ON public.app_config;
DROP POLICY IF EXISTS "Admins can manage config" ON public.app_config;

-- Allow public read access to specific config keys (like changelog)
CREATE POLICY "Public read access for public configs" ON public.app_config
    FOR SELECT USING (
        key IN ('changelog', 'features', 'announcements')
    );

-- Allow authenticated users to read all config
CREATE POLICY "Authenticated users can read all config" ON public.app_config
    FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update config
-- Note: Adjust this based on your admin identification logic
CREATE POLICY "Admins can manage config" ON public.app_config
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Insert initial changelog structure if not exists
INSERT INTO public.app_config (key, value)
VALUES (
    'changelog',
    '{"entries": [], "lastUpdated": "2025-01-12T14:30:00Z"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;