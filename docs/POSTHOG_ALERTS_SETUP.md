# PostHog Alerts Setup Guide

## Overview
This guide shows how to set up email alerts for:
1. **New user signups** (real-time)
2. **First-time visitors** (real-time)  
3. **Returning visitors** (real-time)
4. **Daily summary** (daily email with counts)

## Setup Steps

### 1. New User Signup Alerts

**PostHog Dashboard → Project Settings → Webhooks**

1. Go to your PostHog dashboard
2. Navigate to **Project Settings → Webhooks** (or **Alerts** in newer versions)
3. Create a new alert:
   - **Event:** `signup_completed`
   - **Condition:** Any occurrence
   - **Frequency:** Every time it happens
   - **Action:** Send email to your address

**Alternative: Using PostHog Insights + Alerts**

1. Go to **Insights → Create Insight**
2. Choose **Trends**
3. Select event: `signup_completed`
4. Click **Save** then **Set alert**
5. Configure:
   - **Alert name:** "New User Signup"
   - **Condition:** When data matches this insight
   - **Frequency:** Every time
   - **Notification:** Email

### 2. First-Time Visitor Alerts

1. Go to **Insights → Create Insight → Trends**
2. Event: `user_first_visit`
3. Click **Save** then **Set alert**
4. Configure:
   - **Alert name:** "First-Time Visitor"
   - **Condition:** Every time
   - **Notification:** Email

### 3. Returning Visitor Alerts

1. Go to **Insights → Create Insight → Trends**
2. Event: `auth_login_success`
3. Click **Save** then **Set alert**
4. Configure:
   - **Alert name:** "Returning User Login"
   - **Condition:** Every time
   - **Notification:** Email

### 4. Daily Summary Email

**Using PostHog Digests**

1. Go to **Project Settings → Alerts** (or **Email Reports**)
2. Create a new digest/report:
   - **Name:** "Daily User Summary"
   - **Frequency:** Daily
   - **Insight:** Create a custom insight with:
     - Total `user_first_visit` events (new users)
     - Total `auth_login_success` events (returning users)
   - **Schedule:** Daily at 9 AM (your timezone)
   - **Recipients:** Your email

**Manual Custom Insight for Daily Summary**

```sql
-- In PostHog, create a custom insight with these events:
Event 1: user_first_visit (sum, label: "New Visitors")
Event 2: auth_login_success (sum, label: "Returning Users")

Time range: Last 24 hours
Display: Trends over time
```

Then set up daily email digest for this insight.

## PostHog Pricing Note

**Free tier:** Basic webhooks and alerts available  
**Paid tier:** More advanced alerting and digests

For the free tier, you may need to:
1. Use webhooks to send to a custom endpoint
2. Set up your own notification service
3. Use PostHog's API to poll daily for summaries

## Alternative: Custom Email Service

If PostHog's built-in alerts don't meet your needs:

1. Use **PostHog Webhooks** to send to your own API endpoint
2. Process webhooks and send emails via:
   - **Resend** (recommended for your stack)
   - **SendGrid**
   - **Mailgun**
   - **Supabase Edge Functions** with Resend integration

### Example Webhook Endpoint

```typescript
// app/api/webhooks/posthog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { event, properties } = body;
  
  // Send email based on event type
  await resend.emails.send({
    from: 'notifications@manatap.ai',
    to: 'davy@your-email.com',
    subject: `${event} - ${properties.user_id || 'Anonymous'}`,
    html: `<h2>${event}</h2><pre>${JSON.stringify(properties, null, 2)}</pre>`
  });
  
  return NextResponse.json({ ok: true });
}
```

## Verification

1. Create a test account to trigger `signup_completed`
2. Visit the site in incognito to trigger `user_first_visit`
3. Log in to trigger `auth_login_success`
4. Check your email for alerts

## Troubleshooting

**No emails received:**
- Check PostHog project settings for alert configuration
- Verify your email address is correct
- Check spam folder
- Ensure PostHog plan supports the alert type you chose

**Missing events:**
- Verify `NEXT_PUBLIC_POSTHOG_KEY` is set correctly
- Check PostHog dashboard → Events to see if events are being captured
- Check browser console for PostHog initialization errors

## Next Steps

1. Set up alerts in PostHog dashboard
2. Test each alert type
3. Configure daily digest
4. Optionally set up custom webhook handler if needed

