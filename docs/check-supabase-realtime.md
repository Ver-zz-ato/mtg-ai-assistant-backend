# How to Check if Supabase Real-Time is Enabled

## Method 1: Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **Database** → **Replication** (or **Database** → **Settings** → **Replication**)
4. Look for the `profiles` table in the list
5. Check if it has a toggle/switch enabled for real-time replication

**Note**: On some Supabase plans, real-time is enabled by default for all tables. On others, you need to enable it per table.

## Method 2: SQL Query (Most Reliable)

Run this SQL query in the Supabase SQL Editor:

```sql
-- Check if real-time is enabled for the profiles table
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'profiles'
    ) THEN 'ENABLED'
    ELSE 'DISABLED'
  END as realtime_status
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'profiles';
```

**Expected Result:**
- If real-time is **enabled**: `realtime_status` = `ENABLED`
- If real-time is **disabled**: `realtime_status` = `DISABLED`

## Method 3: Enable Real-Time via SQL (If Disabled)

If real-time is disabled, you can enable it with this SQL:

```sql
-- Enable real-time for the profiles table
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

**Note**: You need to be a database owner/admin to run this. If you get a permission error, you'll need to enable it via the Dashboard.

## Method 4: Test Programmatically

You can test if real-time works by:

1. Open your browser console on your app
2. Toggle Pro status for a user in the admin panel
3. Check the console for the log message: `"Pro status updated via real-time subscription"`

If you see that message, real-time is working! If not, it's either:
- Real-time is disabled
- The subscription failed to connect
- There's a network/firewall issue

## Method 5: Check Supabase Client Configuration

Real-time should work automatically if:
- Your Supabase project has real-time enabled (free tier has it, but with limits)
- The `profiles` table is added to the `supabase_realtime` publication
- Your RLS policies allow the user to see their own profile updates

## Troubleshooting

### If Real-Time is Disabled:

1. **Enable via Dashboard:**
   - Go to Database → Replication
   - Find `profiles` table
   - Toggle real-time ON

2. **Enable via SQL:**
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
   ```

### If Real-Time Still Doesn't Work:

1. **Check RLS Policies:**
   - Users must have SELECT permission on their own profile
   - The real-time subscription respects RLS policies

2. **Check Browser Console:**
   - Look for WebSocket connection errors
   - Check for subscription errors

3. **Check Network:**
   - Real-time uses WebSockets
   - Some firewalls/proxies block WebSocket connections

## Quick Test Script

Run this in your browser console while logged in:

```javascript
const supabase = window.supabase || // your client instance
const channel = supabase
  .channel('test-realtime')
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
    (payload) => console.log('✅ Real-time works!', payload)
  )
  .subscribe();

// Then toggle Pro in admin panel - you should see the log
```

## Plan Limits

- **Free Tier**: Real-time enabled, but with connection limits
- **Pro Tier**: Higher connection limits
- **Team/Enterprise**: Full real-time access

Check your plan limits in Supabase Dashboard → Settings → Billing.

