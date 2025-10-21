'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// SINGLETON: Only create ONE client instance per browser session
let client: SupabaseClient | null = null;

/** Canonical export - returns singleton instance */
export function createBrowserSupabaseClient() {
  if (client) {
    console.log('[Supabase] Reusing existing client instance');
    return client;
  }
  
  console.log('[Supabase] Creating NEW client instance');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  client = createBrowserClient(url, anon);
  return client;
}

/** Back-compat alias (so Header can import either name) */
export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
