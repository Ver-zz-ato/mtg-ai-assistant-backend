'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseUrl } from '@/lib/secure-connections';

// SINGLETON: Only create ONE client instance per browser session
let client: SupabaseClient | null = null;

/** Canonical export - returns singleton instance */
export function createBrowserSupabaseClient() {
  if (client) return client;
  
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Validate and ensure HTTPS in production (Supabase will use wss:// for realtime if URL is https://)
  const url = validateSupabaseUrl(rawUrl);
  
  client = createBrowserClient(url, anon);
  return client;
}

/** Back-compat alias (so Header can import either name) */
export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
