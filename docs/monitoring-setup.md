# Monitoring & Observability Setup

**Date:** 2025-01-27  
**Status:** Documentation for existing monitoring infrastructure

---

## Overview

ManaTap.ai uses multiple monitoring and observability tools to track application health, errors, and user behavior.

---

## Existing Monitoring Tools

### 1. Sentry (Error Tracking)

**Purpose:** Capture and track application errors and exceptions

**Integration:**
- Package: `@sentry/nextjs`
- Configuration: Automatic via Next.js integration
- Error tracking: Server-side and client-side errors

**Access:**
- Sentry Dashboard: Check your Sentry project dashboard
- Errors are automatically captured and grouped

**Configuration:**
- Environment variable: `SENTRY_DSN` (optional, but recommended)
- Errors are sent automatically when Sentry is configured

---

### 2. PostHog (Analytics & Product Analytics)

**Purpose:** Track user behavior, feature usage, and product analytics

**Integration:**
- Client-side: `posthog-js` package
- Server-side: `posthog-node` package
- Consent-gated: Respects user privacy preferences

**Key Events Tracked:**
- User signups and authentication
- Feature usage (chat, deck analysis, etc.)
- Pro subscription conversions
- Error events
- Performance metrics

**Access:**
- PostHog Dashboard: Check your PostHog project
- Environment variables:
  - `NEXT_PUBLIC_POSTHOG_KEY`
  - `NEXT_PUBLIC_POSTHOG_HOST`

---

### 3. Health Check Endpoint

**Purpose:** Monitor service availability and dependencies

**Endpoint:** `/api/health`

**Checks:**
- Database (Supabase) connectivity
- Scryfall API availability
- Stripe API configuration
- OpenAI API configuration

**Response Format:**
```json
{
  "ok": true,
  "checks": {
    "database": { "ok": true, "ms": 45 },
    "scryfall": { "ok": true, "ms": 120 },
    "stripe": { "ok": true, "ms": 0 },
    "openai": { "ok": true, "ms": 0 }
  },
  "ts": "2025-01-27T12:00:00.000Z"
}
```

**Status Codes:**
- `200`: All critical checks passed
- `503`: One or more critical checks failed

**Usage:**
- Uptime monitoring services (UptimeRobot, Pingdom, etc.)
- Load balancer health checks
- Alerting systems

---

## Setting Up Uptime Monitoring

### Option 1: UptimeRobot (Free)

1. Sign up at https://uptimerobot.com
2. Add a new monitor:
   - Type: HTTP(s)
   - URL: `https://app.manatap.ai/api/health`
   - Interval: 5 minutes
   - Alert contacts: Your email
3. Monitor will check every 5 minutes
4. Alerts sent if status code is not 200

### Option 2: Pingdom

1. Sign up at https://www.pingdom.com
2. Add HTTP(S) Transaction check
3. URL: `https://app.manatap.ai/api/health`
4. Expected status: 200
5. Set alert thresholds

### Option 3: Custom Script

```bash
#!/bin/bash
# health-check.sh

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://app.manatap.ai/api/health)

if [ "$RESPONSE" != "200" ]; then
  echo "Health check failed: HTTP $RESPONSE"
  # Send alert (email, Slack, etc.)
  exit 1
fi

echo "Health check passed"
exit 0
```

Run via cron:
```cron
*/5 * * * * /path/to/health-check.sh
```

---

## Alerting Setup

### Critical Alerts

1. **Health Check Failure**
   - Trigger: `/api/health` returns 503
   - Action: Immediate notification
   - Channels: Email, SMS, Slack

2. **High Error Rate**
   - Trigger: > 10 errors/minute in Sentry
   - Action: Investigate immediately
   - Channels: Sentry alerts, Email

3. **Database Connectivity Issues**
   - Trigger: Health check database check fails
   - Action: Check Supabase status
   - Channels: Uptime monitor alerts

### Warning Alerts

1. **Slow Response Times**
   - Trigger: API response time > 2 seconds
   - Action: Review performance
   - Channels: PostHog performance alerts

2. **High API Usage**
   - Trigger: OpenAI API usage spikes
   - Action: Review usage patterns
   - Channels: OpenAI dashboard alerts

---

## Logging

### Server-Side Logging

**Logger Utility:** `frontend/lib/logger.ts`

**Log Levels:**
- `debug()`: Development only
- `info()`: Development console, production analytics
- `warn()`: Always logged, sent to monitoring
- `error()`: Always logged, sent to Sentry

**Usage:**
```typescript
import { logger } from '@/lib/logger';

logger.debug('Debug message', { context });
logger.info('Info message', { context });
logger.warn('Warning message', { context });
logger.error('Error message', error, { context });
```

### Client-Side Logging

- Browser console in development
- PostHog events in production
- Sentry for client-side errors

---

## Performance Monitoring

### PostHog Performance Tracking

- API latency tracking
- Page load times
- Component render performance

### Custom Performance Tracking

See `frontend/lib/analytics-performance.ts` for:
- API call performance
- Component render tracking
- Custom performance metrics

---

## Database Monitoring

### Slow Query Logging

**Utility:** `frontend/lib/server/query-logger.ts`

**Threshold:** Queries > 100ms are logged

**Storage:** `admin_audit` table with action `slow_query`

**Viewing:**
- Admin panel: `/admin/ops`
- Direct query: `SELECT * FROM admin_audit WHERE action = 'slow_query' ORDER BY created_at DESC`

---

## Best Practices

1. **Monitor Health Endpoint**
   - Set up uptime monitoring
   - Check every 1-5 minutes
   - Alert on failures

2. **Review Error Logs Weekly**
   - Check Sentry dashboard
   - Address recurring errors
   - Monitor error trends

3. **Track Performance Metrics**
   - Review PostHog performance dashboards
   - Identify slow endpoints
   - Optimize based on data

4. **Database Performance**
   - Review slow query logs monthly
   - Add indexes for frequently slow queries
   - Monitor database connection pool

5. **API Usage Monitoring**
   - Track OpenAI API costs
   - Monitor rate limits
   - Optimize prompt usage

---

## Troubleshooting

### Health Check Failing

1. Check individual service status:
   - Supabase: https://status.supabase.com
   - Scryfall: Check API directly
   - Stripe: Check dashboard

2. Verify environment variables are set

3. Check application logs for errors

### High Error Rate

1. Check Sentry for error patterns
2. Review recent deployments
3. Check database connectivity
4. Verify API keys are valid

### Slow Performance

1. Check PostHog performance metrics
2. Review slow query logs
3. Check database indexes
4. Review API response caching

---

## Next Steps

1. Set up uptime monitoring (recommended: UptimeRobot)
2. Configure Sentry alerting rules
3. Create PostHog dashboards for key metrics
4. Set up weekly review process
5. Document alert runbooks



