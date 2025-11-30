# Clear Database Test Cases

The admin UI is showing 80 test cases because it combines:
- **42 new test cases** from `ai_test_cases.json` (the ones we just added)
- **38 old test cases** from the database table `ai_test_cases`

To get only the 42 new ones, you need to clear the database table.

## Option 1: Use the API (Recommended)

Call the DELETE endpoint with `?all=true`:

```bash
curl -X DELETE "http://localhost:3000/api/admin/ai-test/cases?all=true" \
  -H "Cookie: your-auth-cookie"
```

Or use the browser console on the admin page:

```javascript
fetch('/api/admin/ai-test/cases?all=true', { method: 'DELETE' })
  .then(r => r.json())
  .then(console.log);
```

## Option 2: SQL in Supabase

Run this SQL in your Supabase SQL editor:

```sql
DELETE FROM ai_test_cases;
```

## After Clearing

After clearing the database, refresh the admin page. You should see:
- **42 test cases** total (all from the JSON file)
- All with source `generated-2025-01-27`

