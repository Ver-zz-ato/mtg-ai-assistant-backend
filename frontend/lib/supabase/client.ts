'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Canonical export */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anon);
}

/** Optional back-compat alias (safe to keep) */
export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
