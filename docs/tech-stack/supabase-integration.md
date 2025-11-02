# Supabase Integration Guide

## Overview

Supabase is the backend-as-a-service (BaaS) providing authentication, database (PostgreSQL), and real-time capabilities. This application uses Supabase for user management, data storage, and Row-Level Security (RLS) policies.

## Architecture

### Client Types

The application uses **three types of Supabase clients** for different purposes:

1. **Browser Client** (Client-Side)
   - Location: `frontend/lib/supabase/client.ts`
   - Purpose: Client-side components, user interactions
   - Authentication: Uses anon key, respects RLS policies
   - Singleton pattern (one instance per session)

2. **Server Client** (API Routes)
   - Location: `frontend/lib/server-supabase.ts`
   - Purpose: Server-side API routes, authenticated requests
   - Authentication: Reads cookies to get user session
   - Creates new instance per request (handles cookies correctly)

3. **Admin Client** (Bypass RLS)
   - Location: `frontend/app/api/_lib/supa.ts` → `getAdmin()`
   - Purpose: Admin operations, bulk imports, bypass RLS
   - Authentication: Uses service role key (bypasses RLS)
   - **Use with caution**: Only for admin/system operations

## Setup & Configuration

### Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Required for Admin Operations
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# Alternative name
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Key Files

- **Browser Client**: `frontend/lib/supabase/client.ts`
  - `createBrowserSupabaseClient()` - Singleton browser client

- **Server Client**: `frontend/lib/server-supabase.ts`
  - `createClient()` - Server-side client with cookie auth
  - `getServerSupabase()` - Alias for createClient

- **Admin Client**: `frontend/app/api/_lib/supa.ts`
  - `getAdmin()` - Admin client (bypasses RLS)
  - `getUserIdViaAny()` - Helper to extract user ID from various sources
  - `decodeJwt()` - JWT token decoder utility

## Client Usage Patterns

### Browser Client (Client Components)

```typescript
'use client';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const supabase = createBrowserSupabaseClient();

// Auth operations
const { data, error } = await supabase.auth.signUp({ email, password });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
const { data: { user } } = await supabase.auth.getUser();

// Database queries (respects RLS)
const { data, error } = await supabase
  .from('decks')
  .select('*')
  .eq('user_id', user.id);
```

### Server Client (API Routes)

```typescript
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id);
    
  return NextResponse.json({ data });
}
```

### Admin Client (Admin Operations)

```typescript
import { getAdmin } from '@/app/api/_lib/supa';

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  
  // Bypasses RLS - can access any user's data
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('is_pro', true);
    
  // Admin auth operations
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  await admin.auth.admin.updateUserById(userId, { user_metadata: { ... } });
}
```

## Authentication Flow

### Sign Up Flow

1. **Client**: `supabase.auth.signUp({ email, password })`
2. **Supabase**: Creates auth user, sends verification email
3. **User**: Clicks email verification link
4. **Redirect**: Supabase redirects to app with `access_token` in URL hash
5. **App**: Extracts token, creates session, user is authenticated

### Sign In Flow

1. **Client**: `supabase.auth.signInWithPassword({ email, password })`
2. **Supabase**: Validates credentials, returns session
3. **App**: Stores session in cookies (handled by Supabase SSR)
4. **Server**: Can read session from cookies in API routes

### Session Management

- **Cookies**: Supabase stores session in cookies with pattern `sb-{project-id}-auth-token`
- **Server-side**: `createClient()` reads cookies automatically
- **Client-side**: Browser client maintains session in localStorage
- **Refresh**: Supabase automatically refreshes tokens

## Database Schema Overview

### Key Tables

**`profiles`** - User profiles
- `id` (UUID, FK to auth.users)
- `email`, `username`, `display_name`
- `is_pro`, `pro_plan`, `pro_since`, `pro_until`
- `stripe_customer_id`, `stripe_subscription_id`
- `avatar`, `favorite_commander`, `signature_deck_id`

**`decks`** - MTG deck lists
- `id`, `user_id`, `title`, `format`
- `is_public`, `description`
- `created_at`, `updated_at`

**`deck_cards`** - Cards in decks
- `deck_id`, `card_name`, `quantity`
- `is_commander`, `is_companion`

**`chat_threads`** - AI chat conversation threads
- `id`, `user_id`, `title`
- `deck_id` (optional link to deck)
- `created_at`

**`chat_messages`** - Messages in threads
- `id`, `thread_id`, `role` (user/assistant)
- `content`, `created_at`

**`collections`** - User card collections
- `id`, `user_id`, `name`
- `created_at`, `updated_at`

**`collection_cards`** - Cards in collections
- `collection_id`, `card_name`, `quantity`, `condition`

**`scryfall_cache`** - Cached card data from Scryfall API
- `name` (normalized, primary key)
- `small`, `normal`, `art_crop` (image URLs)
- `type_line`, `oracle_text`, `mana_cost`, `cmc`
- `color_identity`, `rarity`, `set`
- `updated_at`

**`price_cache`** - Cached card prices
- `card_name` (primary key)
- `usd`, `eur`, `foil_usd`, `tix` (MTGO tickets)
- `updated_at`

**`app_config`** - Application configuration (key-value store)
- `key` (primary key)
- `value` (JSON string)

**`admin_audit`** - Admin action audit log
- `id`, `actor_id`, `action`, `target`, `details`
- `created_at`

## Row-Level Security (RLS)

### RLS Policies

Supabase uses RLS to enforce data access at the database level:

- **User data**: Users can only access their own data
- **Public data**: Some tables have public read access (public decks)
- **Admin operations**: Require service role key to bypass RLS

### Example RLS Pattern

```sql
-- Users can only see their own decks
CREATE POLICY "Users can view own decks"
ON decks FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own decks
CREATE POLICY "Users can insert own decks"
ON decks FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### Bypassing RLS

**Only use admin client when:**
- Admin operations (user management)
- System jobs (bulk imports, migrations)
- Background tasks that need access to all data

**Never use admin client for:**
- Regular API routes (use server client)
- User-facing features (use browser/server client)

## Common Operations

### User Authentication Check

```typescript
// Server-side
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// Client-side
const { data: { user } } = await supabase.auth.getUser();
if (!user) router.push('/login');
```

### Database Query

```typescript
// Select with filters
const { data, error } = await supabase
  .from('decks')
  .select('id, title, format')
  .eq('user_id', userId)
  .eq('is_public', true)
  .order('created_at', { ascending: false })
  .limit(10);

// Insert
const { data, error } = await supabase
  .from('decks')
  .insert({ user_id: userId, title: 'My Deck', format: 'commander' })
  .select()
  .single();

// Update
const { error } = await supabase
  .from('decks')
  .update({ title: 'New Title' })
  .eq('id', deckId);

// Delete
const { error } = await supabase
  .from('decks')
  .delete()
  .eq('id', deckId);
```

### Admin Operations

```typescript
const admin = getAdmin();

// Get user by ID
const { data, error } = await admin.auth.admin.getUserById(userId);

// Update user metadata
await admin.auth.admin.updateUserById(userId, {
  user_metadata: { pro: true, is_pro: true }
});

// Update profile (bypasses RLS)
await admin
  .from('profiles')
  .update({ is_pro: true })
  .eq('id', userId);
```

## Troubleshooting

### "Unauthorized" Errors

**Symptoms**: API routes return 401, queries fail

**Solutions**:
1. Check if user is authenticated: `supabase.auth.getUser()`
2. Verify RLS policies allow the operation
3. For admin routes: Verify admin client is initialized (`getAdmin()` returns non-null)
4. Check cookies are being sent (server-side only)

### RLS Policy Errors

**Symptoms**: Query fails with permission error even when user is authenticated

**Solutions**:
1. Check RLS policies on the table: `SELECT * FROM pg_policies WHERE tablename = 'decks'`
2. Verify policy conditions match your query
3. Test with admin client to see if it's an RLS issue
4. Review Supabase dashboard → Authentication → Policies

### Cookie Issues (Server-Side)

**Symptoms**: Server can't read user session

**Solutions**:
1. Verify `createClient()` is used (not browser client on server)
2. Check cookies are being passed correctly
3. Verify cookie name matches Supabase project ID
4. Check if cookies are being cleared somewhere

### Connection Errors

**Symptoms**: "Failed to fetch" or connection timeout

**Solutions**:
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Check network connectivity
3. Verify Supabase project is active
4. Check Supabase dashboard for service status

### Admin Client Not Working

**Symptoms**: `getAdmin()` returns null or operations fail

**Solutions**:
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
2. Check key is correct (starts with `eyJ...`)
3. Verify key hasn't been rotated
4. Check key has proper permissions in Supabase dashboard

## Best Practices

1. **Always use server client in API routes**
   - Never use browser client on server
   - Server client handles cookies correctly

2. **Use admin client sparingly**
   - Only for admin/system operations
   - Document why admin client is needed
   - Consider security implications

3. **Handle errors gracefully**
   - Always check `error` from Supabase responses
   - Return appropriate HTTP status codes
   - Log errors for debugging

4. **Respect RLS policies**
   - Don't bypass RLS unless absolutely necessary
   - Test with regular user accounts
   - Review policies when adding new features

5. **Use transactions for multi-step operations**
   - Supabase supports transactions via RPC functions
   - Or use batch operations where possible

## Related Files

- `frontend/lib/supabase/client.ts` - Browser client
- `frontend/lib/server-supabase.ts` - Server client
- `frontend/app/api/_lib/supa.ts` - Admin client and utilities
- `frontend/lib/supabase/server.ts` - Server client exports

