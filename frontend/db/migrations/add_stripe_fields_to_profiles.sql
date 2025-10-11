-- Add Stripe subscription fields to profiles table
-- Run this in your Supabase SQL editor

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_plan text CHECK (pro_plan IN ('monthly','yearly'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_since timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_until timestamptz;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON profiles(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON profiles(is_pro);

-- Add comment for documentation
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Active Stripe subscription ID';
COMMENT ON COLUMN profiles.pro_plan IS 'Monthly or yearly subscription plan';
COMMENT ON COLUMN profiles.is_pro IS 'Whether user has active Pro subscription';
COMMENT ON COLUMN profiles.pro_since IS 'When user first became Pro';
COMMENT ON COLUMN profiles.pro_until IS 'When Pro subscription ends (for cancelled subscriptions)';