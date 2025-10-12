-- Add is_admin column to profiles table for admin authentication
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Set yourself as admin (replace 'your-email@example.com' with your actual email)
-- You can also do this manually in the Supabase dashboard after running the migration
-- UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || '{"is_admin": true}' WHERE email = 'your-email@example.com';

-- Now create the admin policy for app_config
CREATE POLICY "Admins can manage config" ON public.app_config
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );