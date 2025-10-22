'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// SINGLETON: Only create ONE client instance per browser session
let client: SupabaseClient | null = null;
let creationCount = 0;

/** Canonical export - returns singleton instance */
export function createBrowserSupabaseClient() {
  if (client) {
    console.log('♻️ [Supabase Client] Reusing existing singleton client');
    return client;
  }
  
  creationCount++;
  console.log(`🆕 [Supabase Client] Creating NEW client (creation #${creationCount})`, {
    timestamp: new Date().toISOString(),
    stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
  });
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // FIX: Use push-based auth (AuthProvider) instead of pull-based getSession() calls
  // to prevent race conditions with Supabase's auto-refresh on window focus
  client = createBrowserClient(url, anon);
  
  console.log('✅ [Supabase Client] Client created successfully');
  return client;
}

/** Back-compat alias (so Header can import either name) */
export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
