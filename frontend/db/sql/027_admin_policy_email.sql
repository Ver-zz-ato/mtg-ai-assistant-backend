-- Create admin policy using email check (replace with your email)
CREATE POLICY "Admins can manage config" ON public.app_config
    FOR ALL TO authenticated USING (
        auth.jwt() ->> 'email' IN ('your-email@example.com', 'davy@example.com')
    );