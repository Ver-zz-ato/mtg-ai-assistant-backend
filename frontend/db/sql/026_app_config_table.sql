-- 026_app_config_table.sql
-- Create app_config table for storing application configuration including changelog
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Create app_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.app_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add helpful indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'app_config_updated_at_idx'
  ) THEN
    CREATE INDEX app_config_updated_at_idx ON public.app_config (updated_at);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DO $$ BEGIN
    -- Drop policies if they exist
    DROP POLICY IF EXISTS "Public read access for public configs" ON public.app_config;
    DROP POLICY IF EXISTS "Authenticated users can read all config" ON public.app_config;
    DROP POLICY IF EXISTS "Admins can manage config" ON public.app_config;
    
    -- Create policies
    -- Allow public read access to specific config keys (like changelog)
    EXECUTE 'CREATE POLICY "Public read access for public configs" ON public.app_config
        FOR SELECT USING (
            key IN (''changelog'', ''features'', ''announcements'')
        )';
    
    -- Allow authenticated users to read all config
    EXECUTE 'CREATE POLICY "Authenticated users can read all config" ON public.app_config
        FOR SELECT TO authenticated USING (true)';
    
    -- Only admins can insert/update config
    -- Note: You may need to adjust this based on your admin identification logic
    EXECUTE 'CREATE POLICY "Admins can manage config" ON public.app_config
        FOR ALL TO authenticated USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND is_admin = true
            )
        )';
END $$;

-- Insert initial changelog structure if not exists
INSERT INTO public.app_config (key, value)
VALUES (
    'changelog',
    '{"entries": [], "lastUpdated": "2025-01-12T14:30:00Z"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Optional: Add some example entries to get started
-- You can uncomment and run this after the table is created
/*
UPDATE public.app_config 
SET value = '{"entries": [
    {
        "version": "v1.2.0",
        "date": "2025-01-12",
        "title": "Enhanced Analytics & User Experience",
        "description": "Major improvements to user tracking, analytics, and overall platform experience with new features designed to help you build better MTG decks.",
        "features": [
            "Comprehensive analytics tracking for user behavior and feature adoption",
            "Enhanced search and discovery capabilities with detailed card search tracking",
            "Improved error detection and user frustration monitoring",
            "First-visit tracking with personalized onboarding experience",
            "Enhanced sharing capabilities with external platform integration"
        ],
        "fixes": [
            "Improved error boundary reporting with detailed context",
            "Better chat session tracking and value moment detection",
            "Enhanced conversion funnel tracking for Pro features"
        ],
        "type": "feature"
    },
    {
        "version": "v1.1.5",
        "date": "2025-01-10",
        "title": "Trust & Transparency Updates",
        "description": "Added transparency features to build user trust and provide better insight into our AI capabilities and data sources.",
        "features": [
            "Public trust footer showing AI model version and data source attribution",
            "Enhanced changelog system for tracking platform updates",
            "Improved sharing experience with better platform integration"
        ],
        "fixes": [
            "Better model attribution and data source transparency",
            "Enhanced public profile sharing capabilities"
        ],
        "type": "improvement"
    }
], "lastUpdated": "2025-01-12T14:30:00Z"}'::jsonb
WHERE key = 'changelog';
*/