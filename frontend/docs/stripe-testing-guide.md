# 🧪 Stripe Integration Testing Guide

## 🎯 **How to Test Your Stripe Implementation**

Since your dev server is running at `http://localhost:3000`, let's test everything step by step.

## **Phase 1: UI and Navigation Tests** ✅

### 1. Test Pricing Page
- [ ] Visit: `http://localhost:3000/pricing`
- [ ] Verify the page loads without errors
- [ ] Check that both pricing tiers are displayed:
  - Free tier: £0 forever
  - Pro tier: £1.99/month or £14.99/year (37% savings)
- [ ] Verify all 10 Pro features are listed in the comparison table
- [ ] Check that "POPULAR" badge appears on Pro tier

### 2. Test Authentication Flow
- [ ] If not signed in, verify "Please sign in first" appears when clicking upgrade
- [ ] Sign in with your test account
- [ ] Verify Pro status shows correctly in the UI

### 3. Test Pro Feature Gates
Navigate to any Pro feature and verify the gates work:
- [ ] Visit a deck page and try the Hand Testing Widget (should be gated)
- [ ] Try Budget Swaps AI mode (should show Pro badge)
- [ ] Test Collection Fix Names (should be disabled for non-Pro)

## **Phase 2: API Endpoint Tests** 🔧

### Test 1: Checkout Session Creation
Open browser dev tools (F12) and test the API:

```javascript
// Test monthly plan
fetch('/api/billing/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'monthly' })
})
.then(r => r.json())
.then(console.log)
```

**Expected Response:**
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### Test 2: Billing Portal (if you have a Stripe customer)
```javascript
// Test billing portal
fetch('/api/billing/portal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
})
.then(r => r.json())
.then(console.log)
```

### Test 3: Pro Context Status
```javascript
// Check if Pro context is working
console.log('Pro status:', document.querySelector('[data-pro-status]')?.dataset.proStatus)
```

## **Phase 3: Stripe Test Mode Integration** 💳

### Prerequisites
You'll need Stripe test keys in your `.env.local`:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Full Checkout Flow Test
1. [ ] Click "Monthly - £1.99" button on pricing page
2. [ ] Should redirect to Stripe Checkout (test mode)
3. [ ] Use test card: `4242424242424242`
4. [ ] Expiry: Any future date (e.g., 12/25)
5. [ ] CVC: Any 3 digits (e.g., 123)
6. [ ] Complete the purchase
7. [ ] Should redirect back to your success URL

### Webhook Testing (Advanced)
If you want to test webhooks locally:

1. Install Stripe CLI:
```bash
# Install via npm
npm install -g stripe

# Login to your Stripe account
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

2. The CLI will show a webhook signing secret - add it to `.env.local`
3. Complete a test purchase and watch the webhook events in the CLI

## **Phase 4: Database Integration Test** 🗄️

### Check Pro Status in Database
After a test purchase, verify the user's Pro status was updated:

1. Go to your Supabase dashboard
2. Open the SQL editor
3. Run:
```sql
SELECT 
  username,
  is_pro,
  pro_plan,
  pro_since,
  stripe_customer_id,
  stripe_subscription_id
FROM profiles 
WHERE is_pro = true
ORDER BY pro_since DESC;
```

## **Phase 5: Error Handling Tests** ⚠️

### Test Error Scenarios
1. [ ] Try to upgrade without being signed in
2. [ ] Test with invalid plan name:
```javascript
fetch('/api/billing/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'invalid' })
})
```
Should return 400 error with proper message.

### Test Network Failures
1. [ ] Disconnect internet and try to upgrade
2. [ ] Should show friendly error message, not crash

## **Quick Visual Tests** 👀

### Things to Look For:
- [ ] No console errors when loading pricing page
- [ ] Pro badges appear on gated features
- [ ] Upgrade buttons work (redirect to Stripe)
- [ ] "Manage Billing" appears for Pro users
- [ ] Pricing amounts display correctly (£1.99, £14.99)
- [ ] Feature comparison table renders properly

## **Production Readiness Checklist** 🚀

### Before Going Live:
- [ ] All tests above pass ✅
- [ ] No console errors ✅  
- [ ] Environment variables configured
- [ ] Stripe products created in dashboard
- [ ] Webhook endpoint registered
- [ ] Test with real card in Stripe test mode
- [ ] Customer portal access works

---

## 🎉 **Testing Results**

**✅ PASS:** All tests successful - Ready for production!
**⚠️ PARTIAL:** Some tests failed - Check implementation
**❌ FAIL:** Major issues found - Needs debugging

### Common Issues and Fixes:

**Issue:** "STRIPE_SECRET_KEY is required" error
**Fix:** Add Stripe keys to `.env.local`

**Issue:** 401 errors on API calls  
**Fix:** Ensure you're signed in with a valid Supabase user

**Issue:** Pricing page shows old features
**Fix:** Clear browser cache and reload

**Issue:** Checkout redirect fails
**Fix:** Check success/cancel URLs in API routes

---

## 🚨 **Quick Test Right Now**

1. **Open:** `http://localhost:3000/pricing`
2. **Check:** Page loads and shows both pricing tiers
3. **Click:** Any upgrade button 
4. **Result:** Should either redirect to Stripe or show "sign in first"

If these 4 steps work, your basic integration is functional! 🎉