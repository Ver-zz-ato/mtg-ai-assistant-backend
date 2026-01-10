# Security Audit Report - Manatap.ai
**Date:** January 10, 2025  
**Status:** ✅ Generally Secure with Recommendations

---

## 🛡️ Executive Summary

Your application has **good security foundations** with multiple layers of protection:
- ✅ Rate limiting (multi-tier: guest/free/pro)
- ✅ Input validation & sanitization
- ✅ Authentication & authorization
- ✅ Content Security Policy (CSP)
- ✅ AI cost controls & budget enforcement
- ✅ Profanity filtering
- ⚠️ Some areas need improvement (see recommendations)

---

## ✅ Strengths

### 1. **Rate Limiting** ✅ Strong
- **Multi-tier system:**
  - Guest users: 50 messages total
  - Free users: 50 messages/day, 20 messages/minute, 500 messages/day hard cap
  - Pro users: Higher limits (1000 requests/hour)
- **Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- **Location:** `frontend/lib/api/rate-limit.ts`, `frontend/app/api/chat/route.ts`
- **⚠️ Issue:** Uses in-memory store (won't work across multiple server instances - needs Redis for scaling)

### 2. **Input Validation & Sanitization** ✅ Good
- **Zod schemas** for API request validation (`ChatPostSchema`, etc.)
- **Profanity filtering** on:
  - Deck titles
  - Usernames
  - Custom card names
  - Wishlist items
  - Shoutbox messages
- **Location:** `frontend/lib/profanity.ts`, various API routes
- **Sanitization functions:** `sanitizeName()`, regex escaping

### 3. **Authentication & Authorization** ✅ Strong
- **Supabase Auth** for user authentication
- **Row-Level Security (RLS)** via Supabase (database-level)
- **Admin checks:** `isAdmin()` function checks user IDs and emails
- **Protected routes:** All sensitive endpoints check `supabase.auth.getUser()`
- **Guest handling:** Separate limits for unauthenticated users

### 4. **Content Security Policy (CSP)** ✅ Good
- **Configured in:** `frontend/next.config.ts`
- **Restrictions:**
  - Scripts limited to self, Stripe, Ko-fi, PostHog
  - Images limited to Scryfall domains
  - Connect-src restricts external API calls
  - Worker-src allows blob URLs for PostHog/Sentry
- **⚠️ Issue:** `'unsafe-inline'` and `'unsafe-eval'` are enabled (needed for Next.js, but increases risk)

### 5. **AI Cost Controls** ✅ Strong
- **Budget enforcement:** Daily/weekly USD limits
- **Cost tracking:** All AI usage logged to `ai_usage` table with cost calculation
- **Token limits:** Max tokens enforced per request (varies by endpoint)
- **Auto-disable:** Risky features can auto-disable when budget exceeded
- **Location:** `frontend/lib/server/budgetEnforcement.ts`, `frontend/app/api/chat/route.ts`
- **Limits:**
  - Free users: 50 messages/day
  - Guest users: 50 messages total
  - Pro users: Higher limits + cost tracking

### 6. **SQL Injection Protection** ✅ Strong
- **Supabase client** uses parameterized queries (automatic protection)
- **No raw SQL** in most endpoints
- **⚠️ Minor:** Some admin routes use `rpc('exec_sql', ...)` but only accessible to admins

### 7. **XSS Protection** ✅ Good
- **React's automatic escaping** for most content
- **Limited `dangerouslySetInnerHTML` usage:**
  - Only in blog posts (trusted content)
  - JSON-LD structured data (static)
  - Changelog formatting (sanitized)
- **Regex escaping** for user-generated content in card names

---

## ⚠️ Potential Vulnerabilities & Recommendations

### 🔴 High Priority

#### 1. **In-Memory Rate Limiting (Scaling Issue)**
**Issue:** Rate limiting uses in-memory Map, won't work across multiple server instances.

**Location:** `frontend/lib/api/rate-limit.ts:16`

**Risk:** If you deploy multiple servers (load balancing), rate limits won't be shared between instances.

**Recommendation:**
```typescript
// Use Redis for distributed rate limiting
import { Redis } from '@upstash/redis'; // or ioredis
const redis = new Redis({ url: process.env.REDIS_URL });
```

**Action:** Monitor scaling needs. If deploying multiple instances, migrate to Redis.

#### 2. **Guest User Abuse Prevention**
**Issue:** Guest users can create 50 messages, but limit is client-side enforced (`guestMessageCount`).

**Location:** `frontend/app/api/chat/route.ts:270-271`

**Risk:** Users could modify client-side code to bypass guest limit.

**Recommendation:**
- Track guest messages server-side (use IP + session ID)
- Store in database or Redis
- Enforce on server, not client

**Current:** ✅ Server-side check exists but relies on client-provided count

#### 3. **CSP 'unsafe-inline' and 'unsafe-eval'**
**Issue:** Required for Next.js but reduces XSS protection.

**Risk:** If malicious script injection occurs, CSP won't block it.

**Recommendation:**
- Use nonces for inline scripts (Next.js 15 supports this)
- Minimize inline scripts
- Review all `dangerouslySetInnerHTML` usage

**Status:** Acceptable for now (Next.js requirement), but monitor.

---

### 🟡 Medium Priority

#### 4. **CSRF Protection**
**Issue:** No explicit CSRF tokens (Next.js API routes rely on same-origin policy).

**Risk:** Low (same-origin policy protects), but not foolproof.

**Recommendation:**
- Add CSRF tokens for sensitive POST operations (optional)
- Verify `Origin` header on state-changing requests
- Current protection: Same-origin policy + Supabase auth cookies

#### 5. **Admin Route SQL Execution**
**Issue:** Some admin routes use `rpc('exec_sql', { sql: '...' })`.

**Location:** `frontend/app/api/admin/data/vacuum-analyze/route.ts:59`

**Risk:** If admin account is compromised, SQL injection could occur.

**Recommendation:**
- Only allow predefined SQL commands (whitelist)
- Use parameterized queries instead
- Limit admin access with MFA

**Current:** ✅ Only accessible to admins, but still risky if compromised

#### 6. **File Upload Security** (if added in future)
**Current:** No file uploads detected.

**Recommendation (if adding):**
- Validate file types (MIME + extension)
- Limit file size
- Scan for malware
- Store files outside web root
- Generate random filenames

#### 7. **API Key Exposure**
**Issue:** API keys in environment variables (standard practice, but monitor).

**Recommendation:**
- ✅ Already using env vars (good!)
- Rotate keys regularly
- Use secrets manager (Vercel/Heroku secrets) if available
- Never commit keys to git

---

### 🟢 Low Priority / Monitoring

#### 8. **Malicious External Script Errors (Already Fixed)**
**Status:** ✅ Fixed in `frontend/instrumentation-client.ts`

**Issue:** Errors from `sevendata.fun` and `secdomcheck.online` (browser extensions/malware).

**Solution:** Added Sentry `beforeSend` filter to ignore these errors.

#### 9. **Error Message Sanitization**
**Current:** ✅ Error messages are sanitized before sending to analytics.

**Location:** `frontend/lib/analytics-performance.ts:68-69`

**Recommendation:** Continue monitoring for PII in error logs.

#### 10. **Session Management**
**Current:** ✅ Supabase handles sessions via HTTP-only cookies.

**Recommendation:**
- Monitor for session hijacking attempts
- Consider adding session timeout warnings
- Rotate session tokens regularly (Supabase handles this)

---

## 🔒 AI Abuse Prevention

### Current Protections ✅
1. **Rate Limiting:**
   - Free: 50 messages/day, 20/minute
   - Pro: Higher limits
   - Guest: 50 messages total

2. **Cost Tracking:**
   - All AI usage logged with cost calculation
   - Budget enforcement (daily/weekly USD limits)
   - Token limits per request

3. **Input Validation:**
   - Zod schemas validate all inputs
   - Profanity filtering
   - Length limits on text inputs

### Additional Recommendations

#### 1. **Prompt Injection Protection**
**Current:** Basic validation exists.

**Recommendation:**
- Add prompt injection detection (check for common attack patterns)
- Limit prompt length (currently enforced via token limits)
- Monitor for suspicious patterns (repeated prompts, long inputs)

#### 2. **Cost Per User Limits**
**Current:** Global budget limits exist.

**Recommendation:**
- Add per-user daily cost limits (beyond message count)
- Track cost per user in `ai_usage` table (already tracked!)
- Auto-throttle high-cost users

#### 3. **Token Limits Enforcement**
**Current:** ✅ Token limits enforced per endpoint.

**Location:** `frontend/lib/config/streaming.ts:4` (MAX_TOKENS_STREAM = 2000)

**Recommendation:**
- Consider reducing for free users
- Monitor average token usage per request
- Alert on unusually high token usage

---

## 🛡️ Additional Security Measures (Optional Enhancements)

### 1. **Web Application Firewall (WAF)**
- **Service:** Cloudflare, AWS WAF, or Vercel Edge
- **Benefits:** Block DDoS, SQL injection attempts, XSS patterns
- **Priority:** Medium (nice-to-have, not critical)

### 2. **DDoS Protection**
- **Current:** Vercel/Cloudflare provides basic DDoS protection
- **Enhancement:** Add rate limiting at edge (Cloudflare rate limiting rules)

### 3. **Security Headers**
**Current:** ✅ CSP is configured.

**Additional Headers to Consider:**
```typescript
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
'X-Content-Type-Options': 'nosniff',
'X-Frame-Options': 'DENY',
'Referrer-Policy': 'strict-origin-when-cross-origin',
'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
```

**Action:** Add these to `next.config.ts` headers()

### 4. **Logging & Monitoring**
**Current:** ✅ Sentry for error tracking, PostHog for analytics.

**Enhancement:**
- Add security event logging (failed auth attempts, rate limit violations)
- Monitor for suspicious patterns
- Alert on unusual API usage spikes

### 5. **Regular Security Audits**
- **Frequency:** Quarterly
- **Tools:** OWASP ZAP, npm audit, Snyk
- **Action:** Set up automated dependency scanning in CI/CD

---

## 📊 Security Scorecard

| Category | Status | Score |
|----------|--------|-------|
| **Authentication** | ✅ Strong | 9/10 |
| **Authorization** | ✅ Strong | 9/10 |
| **Rate Limiting** | ⚠️ Good (needs Redis) | 7/10 |
| **Input Validation** | ✅ Strong | 9/10 |
| **XSS Protection** | ✅ Good | 8/10 |
| **SQL Injection** | ✅ Strong | 10/10 |
| **CSRF Protection** | ⚠️ Basic (same-origin) | 7/10 |
| **CSP** | ⚠️ Good (has unsafe-*) | 7/10 |
| **AI Abuse Prevention** | ✅ Strong | 9/10 |
| **Cost Controls** | ✅ Strong | 9/10 |
| **Error Handling** | ✅ Good | 8/10 |
| **Logging** | ✅ Good | 8/10 |

**Overall Security Score: 8.3/10** ✅

---

## 🎯 Immediate Action Items

### Priority 1 (This Week)
1. ✅ **Already Fixed:** Filter malicious external script errors in Sentry
2. ✅ **Already Fixed:** Fixed `/terms` page DYNAMIC_SERVER_USAGE error
3. **Add security headers** (HSTS, X-Frame-Options, etc.) to `next.config.ts`

### Priority 2 (This Month)
4. **Migrate rate limiting to Redis** if planning multi-instance deployment
5. **Implement server-side guest message tracking** (IP + session)
6. **Add prompt injection detection** for AI endpoints

### Priority 3 (Future)
7. **Set up automated dependency scanning** (npm audit in CI)
8. **Add per-user cost limits** (beyond message limits)
9. **Consider WAF** if traffic grows significantly

---

## ✅ Conclusion

**Your application is secure for production use** with good foundations:
- ✅ Strong authentication & authorization
- ✅ Multiple rate limiting layers
- ✅ AI cost controls & budget enforcement
- ✅ Input validation & sanitization
- ✅ Proper use of Supabase security features

**Main concerns:**
- ⚠️ In-memory rate limiting won't scale to multiple instances (needs Redis)
- ⚠️ Some CSP `unsafe-*` directives (required for Next.js, but monitor)
- ⚠️ Guest limit enforcement could be stronger (server-side tracking)

**Recommendation:** Address Priority 1 items, then monitor and scale based on traffic. The security foundation is solid! 🛡️

---

## 📚 Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Supabase Security Guide](https://supabase.com/docs/guides/auth/security)
- [OpenAI Security Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)

---

**Last Updated:** January 10, 2025
