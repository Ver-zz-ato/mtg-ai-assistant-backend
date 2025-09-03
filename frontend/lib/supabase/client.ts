'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Canonical export */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anon);
}

/** Back-compat alias (so Header can import either name) */
export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
