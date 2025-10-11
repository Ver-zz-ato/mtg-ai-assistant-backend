# 🚀 Stripe Production Deployment Checklist

## ✅ **Already Complete**

### Code Implementation
- [x] Stripe SDK integration with API version 2024-06-20
- [x] Database schema with all Stripe fields in `profiles` table
- [x] Complete API routes: checkout, portal, webhooks
- [x] Pro context system with `usePro()` hook
- [x] 20+ Pro features properly gated
- [x] Beautiful pricing page with updated feature list
- [x] Error handling and analytics tracking

### Frontend Features
- [x] Pricing page (`/pricing`) with monthly £1.99/yearly £14.99
- [x] Pro badge system throughout UI
- [x] Toast notifications for Pro feature gates
- [x] Billing portal integration
- [x] User authentication with Supabase

## 🔧 **Production Setup Required**

### 1. Stripe Dashboard Configuration

#### Products & Prices
- [ ] Verify products exist in Stripe Dashboard:
  - `prod_TDaREGWGBQSSBQ` (Monthly Plan - £1.99)
  - `prod_TDaRNmnrBcfWlZ` (Yearly Plan - £14.99)
- [ ] Confirm active recurring prices are set for both products
- [ ] Test mode vs live mode configuration

#### Webhook Endpoint
- [ ] Add webhook endpoint in Stripe Dashboard:
  - URL: `https://api.manatap.ai/api/stripe/webhook`
  - Events to send:
    - `checkout.session.completed`
    - `customer.subscription.updated` 
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_failed`
- [ ] Copy webhook signing secret for environment variables

### 2. Environment Variables

#### Render (Backend)
```bash
# Production Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Test Environment (optional)
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
```

#### Vercel (Frontend)  
```bash
# Production Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Test Environment (optional) 
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
```

### 3. Database Migration

Run in Supabase SQL editor:

```sql
-- Verify Stripe fields exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name LIKE 'stripe_%' OR column_name LIKE 'pro_%' OR column_name = 'is_pro';

-- If missing, run the migration:
-- \i frontend/db/migrations/add_stripe_fields_to_profiles.sql
```

### 4. Testing Checklist

#### Test Environment
- [ ] Test checkout flow with test card: `4242424242424242`
- [ ] Verify webhook events are received and processed
- [ ] Test subscription cancellation in customer portal
- [ ] Confirm Pro status updates correctly in UI
- [ ] Test plan switching (monthly ↔ yearly)

#### Production Validation  
- [ ] Small live transaction test (£1.99 monthly)
- [ ] Verify Pro features activate immediately after payment
- [ ] Test customer portal access and functionality
- [ ] Confirm webhook events process correctly
- [ ] Test subscription cancellation flow

### 5. Monitoring & Analytics

#### Error Tracking
- [ ] Stripe webhook failures logged in console
- [ ] PostHog events track subscription actions:
  - `pricing_page_viewed`
  - `pricing_upgrade_clicked`
  - `billing_portal_clicked`

#### Business Metrics
- [ ] Track conversion rates on pricing page
- [ ] Monitor failed payments and churn
- [ ] Pro feature usage analytics

## 🎯 **Launch Strategy**

### Soft Launch
1. [ ] Deploy to production with Stripe test mode
2. [ ] Internal testing with small team
3. [ ] Fix any issues discovered

### Production Launch
1. [ ] Switch to live Stripe keys
2. [ ] Announce Pro features to existing users
3. [ ] Monitor for first 24 hours closely
4. [ ] Have customer support ready

## 🆘 **Emergency Rollback Plan**

If issues occur:
1. [ ] Disable new subscriptions (comment out upgrade buttons)
2. [ ] Continue honoring existing Pro subscriptions  
3. [ ] Fix issues in test environment
4. [ ] Redeploy when ready

## 📞 **Support Information**

- **Stripe Support**: Available in Stripe Dashboard
- **Customer Issues**: Direct to billing portal or davy@manatap.ai
- **Refund Policy**: 14-day refund window (already implemented)

## ✨ **Pro Feature Summary**

Your 20 Pro features are already implemented:

**🎯 Deck Analysis & AI Features:**
- Hand Testing Widget
- Deck Probability Panel  
- Budget Swaps (AI Mode + Export)
- AI Deck Assistant

**📊 Collection Management:**
- Fix Card Names (Batch)
- Price Snapshots
- Bulk Operations

**📈 Advanced Features:**
- Export to Moxfield/MTGO
- Price Tracking & Alerts
- Trend Sparklines
- Watchlist Management
- And 9 more...

---

## 🎉 **Ready to Launch!**

Your Stripe implementation is comprehensive and production-ready. The main remaining tasks are:
1. Stripe Dashboard configuration
2. Environment variable deployment  
3. Testing with live cards
4. Launch! 

You're very close to having a fully functional Pro subscription system!