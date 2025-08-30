// lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Make the failure visible in prod too
    console.error("Supabase env missing. URL:", url, "ANON:", anon ? "set" : "missing");
    throw new Error("Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return createBrowserClient(url, anon, { db: { schema: "public" } });
}
