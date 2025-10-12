-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS public.app_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 2: Create index
CREATE INDEX IF NOT EXISTS app_config_updated_at_idx ON public.app_config (updated_at);

-- Step 3: Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies (run these one at a time if needed)

-- Policy 1: Public read for changelog
CREATE POLICY "Public read access for public configs" ON public.app_config
    FOR SELECT USING (key IN ('changelog', 'features', 'announcements'));

-- Policy 2: Authenticated users can read all
CREATE POLICY "Authenticated users can read all config" ON public.app_config
    FOR SELECT TO authenticated USING (true);

-- Policy 3: Admins can manage (you may need to adjust the admin check)
CREATE POLICY "Admins can manage config" ON public.app_config
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Step 5: Insert initial data
INSERT INTO public.app_config (key, value)
VALUES (
    'changelog',
    '{"entries": [], "lastUpdated": "2025-01-12T14:30:00Z"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;