# Safe Deployment: RLS Migration 053

## Revert Options

### 1. Git revert (before committing)
If you haven't committed yet:
```powershell
git checkout -- frontend/app/api/admin/ai/config/route.ts
git checkout -- frontend/lib/config/prompts.ts
git checkout -- frontend/lib/api/guest-limit-check.ts
git checkout -- frontend/app/api/chat/route.ts
git checkout -- frontend/app/api/chat/stream/route.ts
git checkout -- frontend/app/api/deck/analyze/route.ts
git checkout -- frontend/app/api/admin/prompt-versions/route.ts
git checkout -- frontend/app/api/admin/prompt-versions/create/route.ts
git checkout -- frontend/app/api/admin/prompt-version/route.ts
git checkout -- frontend/app/api/admin/ai-test/refactor-prompt/route.ts
git checkout -- frontend/app/api/admin/ai-test/prompt-impact/route.ts
git checkout -- frontend/app/api/admin/ai-test/apply-improvements/route.ts
```

Or revert everything:
```powershell
git stash
```

### 2. Database revert (after 053 was applied)
If migration 053 was already run in Supabase and things broke, run this in Supabase SQL Editor:
```sql
-- Run: frontend/db/migrations/054_revert_rls_high_medium_priority.sql
ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_context_summary DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions DISABLE ROW LEVEL SECURITY;
```

---

## Safe Testing Order

**Critical: Deploy CODE first, then run migration 053.**

| Step | Action | Why |
|------|--------|-----|
| 1 | Run `npm run build` in frontend | Catches compile errors |
| 2 | Run `npm run test:canary` or `npm run test:e2e` | Smoke test before deploy |
| 3 | Deploy the code changes (getAdmin usage) | New code works with RLS OFF |
| 4 | Verify app works in production | Chat, deck analyze, admin config |
| 5 | Run migration 053 in Supabase | Enables RLS; getAdmin bypasses it |

If you run migration 053 **before** deploying the code, the old code will fail (RLS blocks anon/authenticated).

---

## Quick Verification Checklist

After deploying code + migration:

- [ ] Admin AI config page loads (reads `admin_audit_log`)
- [ ] Chat works (uses `deck_context_summary`, `prompt_versions`)
- [ ] Deck analyze works (uses `deck_context_summary`)
- [ ] Guest chat works (uses `guest_sessions`)
