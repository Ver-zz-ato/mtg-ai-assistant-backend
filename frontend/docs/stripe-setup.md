# Stripe Integration Setup Guide

## 🎉 Implementation Complete!

Your Stripe subscription system has been fully implemented with the following features:

### ✅ What's Been Implemented

- **Monthly Plan**: £1.99/month (`prod_TDaREGWGBQSSBQ`)
- **Yearly Plan**: £14.99/year (`prod_TDaRNmnrBcfWlZ`) - 37% savings
- **Stripe Checkout**: Full subscription flow
- **Customer Portal**: Billing management for existing customers  
- **Webhooks**: Real-time subscription status updates
- **Database Integration**: Pro status stored in `profiles.is_pro`
- **UI Integration**: Pro badges, billing buttons, and context

### 🔧 Environment Variables Needed

#### Frontend (Vercel)
```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...  # Your Stripe publishable key
```

#### Backend (Render - where your API routes run)
```bash
STRIPE_SECRET_KEY=sk_live_...           # Your Stripe secret key  
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret from Stripe
```

### 📊 Database Migration

Run this SQL in your Supabase SQL Editor:

```sql
-- Add Stripe subscription fields to profiles table
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
```

### 🔗 Webhook Configuration

Your webhook endpoint is already configured:
- **URL**: `https://api.manatap.ai/api/stripe/webhook`
- **Events to listen for**:
  - `checkout.session.completed`
  - `customer.subscription.updated`  
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

### 🧪 Local Testing

For local development:

1. Install Stripe CLI: `stripe login`
2. Forward webhooks: `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`
3. Copy the webhook signing secret to your `.env.local` as `STRIPE_WEBHOOK_SECRET`

### 🎯 How It Works

1. **User clicks upgrade** → Creates Stripe Checkout session
2. **Stripe Checkout** → User completes payment
3. **Webhook fires** → Updates `profiles.is_pro = true`
4. **ProContext** → Detects Pro status from database
5. **UI updates** → Shows Pro features and billing management

### 💡 Key Features

- **Automatic Customer Creation**: First-time users get Stripe customers created automatically
- **Price Resolution**: Product IDs map to current active prices dynamically  
- **Subscription Management**: Users can upgrade, downgrade, and cancel via Stripe Portal
- **Real-time Updates**: Webhooks ensure database is always in sync with Stripe
- **Graceful Fallback**: Pro status falls back to user metadata if database unavailable

### 🏁 Ready to Go!

Once you set the environment variables and run the database migration:

1. Users can upgrade to Pro on `/pricing`
2. Pro users can manage billing via "Manage Billing" buttons
3. Webhooks will automatically update Pro status
4. ProBadges and Pro-only features will work throughout the app

The system is production-ready and follows Stripe best practices for security and reliability!