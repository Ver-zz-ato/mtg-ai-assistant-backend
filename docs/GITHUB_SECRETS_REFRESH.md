# Re-saving GitHub Secrets to Remove Hidden Characters

## Why?

Sometimes when secrets are copied/pasted, hidden control characters (`\r`, `\n`, or stray quotes) can sneak in, causing curl commands in GitHub Actions to fail with "couldn't resolve host" errors.

## Fix

Even though the URL looks correct, re-saving it forces GitHub to store it cleanly:

1. Go to **Settings → Secrets and variables → Actions**
2. Click the pencil/edit icon next to `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
3. Copy the current URL from the masked field
4. Paste it into Notepad or any plain text editor
5. **Verify it looks correct**: `https://sjstgotitjapjkvxryru.supabase.co`
6. **Copy it again** from Notepad
7. Paste it back into GitHub
8. Click **"Update secret"**

Repeat for `SUPABASE_SERVICE_ROLE_KEY` as well.

## Verify

After re-saving, the next GitHub Actions run should show:
- `🔍 Original URL length: XX characters`
- `🔍 Cleaned URL length: YY characters` (should be same or 1-2 chars less if trailing slash removed)

If the lengths are the same and there are no connection errors, you're all set!

