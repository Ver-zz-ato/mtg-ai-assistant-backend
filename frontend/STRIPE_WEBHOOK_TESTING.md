# 🔗 Stripe Webhook Testing Guide

## ✅ Webhook Implementation Complete

Your webhook endpoint is fully implemented at `/api/stripe/webhook` with the following features:

### Features
- ✅ **Signature Verification**: Validates all incoming webhooks
- ✅ **Idempotency**: Prevents duplicate event processing
- ✅ **Comprehensive Event Handling**: Supports 8 event types
- ✅ **Error Handling**: Graceful error recovery and logging
- ✅ **TypeScript**: Fully typed for safety

### Supported Events

| Event | Handler | Purpose |
|-------|---------|---------|
| `checkout.session.completed` | ✅ | Initial subscription creation |
| `payment_intent.succeeded` | ✅ | Payment confirmed |
| `invoice.payment_succeeded` | ✅ | Recurring payment successful |
| `customer.subscription.updated` | ✅ | Subscription status change |
| `customer.subscription.deleted` | ✅ | Subscription cancelled |
| `invoice.paid` | ✅ | Invoice paid (logged) |
| `invoice.payment_failed` | ✅ | Payment failure handling |

---

## 🧪 Local Testing with Stripe CLI

### 1. Install Stripe CLI

**Windows (PowerShell as Admin):**
```powershell
scoop install stripe
```

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe
```

### 2. Login to Stripe

```bash
stripe login
```

This will open your browser to authenticate with Stripe.

### 3. Start Your Local Server

```bash
cd frontend
npm run dev
```

Your Next.js app should be running on `http://localhost:3000`.

### 4. Forward Webhooks to Localhost

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

**Expected output:**
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx (^C to quit)
```

### 5. Copy Webhook Secret to .env.local

Create or update `frontend/.env.local`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

**Restart your dev server** after updating environment variables.

### 6. Trigger Test Events

In a **new terminal**, trigger test events:

```bash
# Test checkout completion
stripe trigger checkout.session.completed

# Test payment intent
stripe trigger payment_intent.succeeded

# Test invoice payment
stripe trigger invoice.payment_succeeded

# Test subscription update
stripe trigger customer.subscription.updated

# Test subscription deletion
stripe trigger customer.subscription.deleted
```

### 7. Monitor Logs

Check your **dev server terminal** for logs:

```
Stripe webhook event received {
  type: 'checkout.session.completed',
  id: 'evt_xxxxxxxxx',
  created: 1234567890
}
Processing checkout session completed {
  sessionId: 'cs_test_xxxxx',
  customerId: 'cus_xxxxx',
  subscriptionId: 'sub_xxxxx'
}
```

---

## 🚀 Production Setup

### 1. Configure Live Webhook in Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click **+ Add endpoint**
3. Enter endpoint URL:
   - **URL**: `https://manatap.ai/api/stripe/webhook`
   - **Description**: "ManaTap Pro Subscriptions"
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `payment_intent.succeeded`
   - ✅ `invoice.payment_succeeded`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.paid`
   - ✅ `invoice.payment_failed`
5. Click **Add endpoint**

### 2. Get Webhook Signing Secret

After creating the endpoint:
1. Click on the webhook endpoint
2. Click **Reveal** under "Signing secret"
3. Copy the secret (starts with `whsec_`)

### 3. Update Production Environment Variables

**Vercel:**
```bash
# Go to Vercel Dashboard → Your Project → Settings → Environment Variables
STRIPE_WEBHOOK_SECRET=whsec_live_xxxxxxxxxxxxx
```

**Or via CLI:**
```bash
vercel env add STRIPE_WEBHOOK_SECRET production
# Paste your webhook secret when prompted
```

### 4. Redeploy

```bash
vercel --prod
```

Or push to your main branch if using GitHub integration.

### 5. Verify Webhook

1. Go to Stripe Dashboard → Webhooks
2. Click your webhook endpoint
3. Click **Send test webhook**
4. Select `checkout.session.completed`
5. Click **Send test webhook**

Check the **Recent deliveries** tab:
- ✅ **Success (200)**: Webhook working!
- ❌ **Failed**: Check Vercel logs

---

## 🐛 Troubleshooting

### Issue: "Webhook signature verification failed"

**Cause:** Wrong `STRIPE_WEBHOOK_SECRET` or body parsing issues.

**Fix:**
1. Double-check the secret matches Stripe dashboard
2. Ensure no bodyParser middleware is interfering
3. Restart dev server after updating .env.local

### Issue: "Missing STRIPE_WEBHOOK_SECRET"

**Fix:**
```bash
# Add to .env.local
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

# Restart dev server
npm run dev
```

### Issue: Webhook not receiving events locally

**Fix:**
1. Ensure `stripe listen` is running
2. Check that dev server is on port 3000
3. If using different port: `stripe listen --forward-to http://localhost:XXXX/api/stripe/webhook`

### Issue: Duplicate events being processed

**Fix:** Webhook already has idempotency built-in! Duplicates are automatically ignored.

Check logs for:
```
Duplicate event ignored { eventId: 'evt_xxxxx', type: 'checkout.session.completed' }
```

### Issue: Database not updating

**Check:**
1. User has `stripe_customer_id` in profiles table
2. Supabase connection is working
3. Check Vercel logs for errors

---

## 📊 Monitoring Webhooks

### In Development

Watch terminal output:
```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook --print-json
```

### In Production

**Vercel Logs:**
```bash
vercel logs --follow
```

**Stripe Dashboard:**
1. Go to Webhooks
2. Click your endpoint
3. View **Recent deliveries**

---

## 🔒 Security Best Practices

✅ **Always verify signatures** - Already implemented
✅ **Never commit webhook secrets** - Use environment variables
✅ **Use different secrets for test/live** - Separate environments
✅ **Monitor failed webhooks** - Check Stripe dashboard regularly
✅ **Implement idempotency** - Already implemented
✅ **Use HTTPS in production** - Vercel provides this automatically

---

## 📝 Quick Reference

### Environment Variables Needed

```bash
# Required for webhook
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Required for checkout
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Webhook Endpoint

- **Local**: `http://localhost:3000/api/stripe/webhook`
- **Production**: `https://manatap.ai/api/stripe/webhook`

### Test Commands

```bash
# Start forwarding
stripe listen --forward-to http://localhost:3000/api/stripe/webhook

# Trigger events
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_succeeded
```

---

## ✨ What's Next?

- [ ] Test a real subscription flow end-to-end
- [ ] Monitor webhook deliveries in Stripe dashboard
- [ ] Set up alerts for failed webhooks
- [ ] Add email notifications for payment failures (TODO in code)
- [ ] Consider Redis for idempotency in multi-server setups

---

**Need help?** Check [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)

















