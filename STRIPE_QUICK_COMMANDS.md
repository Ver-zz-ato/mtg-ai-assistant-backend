# Stripe Webhook - Quick Command Reference

## 🚀 Quick Start (Copy & Paste)

### 1. Start Dev Server
```bash
cd frontend
npm run dev
```

### 2. Start Webhook Forwarding
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe listen --forward-to http://localhost:3000/api/stripe/webhook
```

### 3. Copy Webhook Secret from Terminal
Look for output like:
```
> Ready! Your webhook signing secret is whsec_1234567890abcdef
```

Add to `frontend/.env.local`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef
```

### 4. Restart Dev Server
Stop (Ctrl+C) and restart:
```bash
npm run dev
```

---

## 🧪 Test Commands

### Test Individual Events
```bash
cd %USERPROFILE%\Downloads\stripe-cli

# Test checkout completion (user becomes Pro)
.\stripe.exe trigger checkout.session.completed

# Test payment intent
.\stripe.exe trigger payment_intent.succeeded

# Test invoice payment (recurring)
.\stripe.exe trigger invoice.payment_succeeded

# Test subscription update
.\stripe.exe trigger customer.subscription.updated

# Test payment failure
.\stripe.exe trigger invoice.payment_failed

# Test subscription deletion (user loses Pro)
.\stripe.exe trigger customer.subscription.deleted
```

### Test All Events (Full Flow)
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe trigger checkout.session.completed
.\stripe.exe trigger payment_intent.succeeded
.\stripe.exe trigger invoice.payment_succeeded
.\stripe.exe trigger customer.subscription.updated
.\stripe.exe trigger customer.subscription.deleted
```

---

## 📊 Monitoring Commands

### Watch Stripe Events in Real-Time
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe listen --print-json
```

### View Recent Events
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe events list
```

### View Specific Event Details
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe events retrieve evt_xxxxxxxxx
```

---

## 🔧 Production Commands

### Deploy to Vercel
```bash
cd frontend
vercel --prod
```

### Add Environment Variable
```bash
vercel env add STRIPE_WEBHOOK_SECRET production
# Paste your webhook secret when prompted
```

### View Production Logs
```bash
vercel logs --follow
```

### View Recent Logs
```bash
vercel logs
```

---

## 🐛 Debugging Commands

### Test Webhook Locally (Curl)
```bash
# Note: This will fail signature verification (expected)
curl -X POST http://localhost:3000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "test"}'
```

### Check Stripe CLI Version
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe --version
```

### Login to Stripe (if needed)
```bash
cd %USERPROFILE%\Downloads\stripe-cli
.\stripe.exe login
```

---

## 📝 File Locations

- **Webhook Route**: `frontend/app/api/stripe/webhook/route.ts`
- **Stripe Config**: `frontend/lib/stripe.ts`
- **Environment**: `frontend/.env.local` (local) or Vercel Dashboard (production)
- **Stripe CLI**: `%USERPROFILE%\Downloads\stripe-cli\stripe.exe`

---

## ✅ Checklist

### Local Testing
- [ ] Dev server running (`npm run dev`)
- [ ] Stripe CLI forwarding (`stripe listen`)
- [ ] Webhook secret in `.env.local`
- [ ] Dev server restarted after adding secret
- [ ] Test events triggered successfully
- [ ] Logs show "Stripe webhook event received"

### Production Setup
- [ ] Webhook endpoint added in Stripe Dashboard
- [ ] `STRIPE_WEBHOOK_SECRET` added to Vercel
- [ ] Deployed to production (`vercel --prod`)
- [ ] Test webhook sent from Stripe Dashboard
- [ ] Webhook shows 200 success in dashboard
- [ ] Monitored for 24 hours

---

## 🎯 Expected Log Output

### Successful Webhook
```
Stripe webhook event received {
  type: 'checkout.session.completed',
  id: 'evt_1234567890',
  created: 1234567890
}
Processing checkout session completed {
  sessionId: 'cs_test_xxxxx',
  customerId: 'cus_xxxxx',
  subscriptionId: 'sub_xxxxx'
}
User upgraded to Pro {
  userId: 'uuid-here',
  plan: 'monthly',
  subscriptionId: 'sub_xxxxx'
}
```

### Duplicate Event (Idempotency Working)
```
Stripe webhook event received {
  type: 'checkout.session.completed',
  id: 'evt_1234567890',
  created: 1234567890
}
Duplicate event ignored { eventId: 'evt_1234567890', type: 'checkout.session.completed' }
```

### Signature Failure
```
Webhook signature verification failed: Invalid signature
```
**Fix:** Check `STRIPE_WEBHOOK_SECRET` is correct and server restarted.

---

## 💡 Pro Tips

1. **Keep Stripe CLI running** - It automatically forwards all webhook events
2. **Watch both terminals** - Dev server logs and Stripe CLI output
3. **Test locally first** - Catch issues before production
4. **Check Stripe Dashboard** - Monitor webhook deliveries
5. **Use test mode** - Never test with live keys locally

---

## 🚨 Emergency Rollback

If webhooks are causing issues in production:

1. **Disable webhook in Stripe Dashboard:**
   - Dashboard → Webhooks → Click endpoint → Click "..." → Disable

2. **Remove from Vercel env:**
   ```bash
   vercel env rm STRIPE_WEBHOOK_SECRET production
   vercel --prod
   ```

3. **Investigate logs:**
   ```bash
   vercel logs --since 1h
   ```

4. **Fix issue and re-enable**

---

**Need detailed instructions?** See `STRIPE_WEBHOOK_IMPLEMENTATION.md`





















