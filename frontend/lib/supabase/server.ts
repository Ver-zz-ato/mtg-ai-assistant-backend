// lib/supabase/server.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 15+ compatible Supabase server client.
 * Exports:
 *  - createSupabaseServerClient()  // preferred
 *  - createClient()                // legacy alias for existing imports
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();   // must await in Next 15
  const headerList = await headers();    // must await in Next 15

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(_name: string, _value: string, _options: any) {
          // no-op in route handlers; use Response cookies to mutate if needed
        },
        remove(_name: string, _options: any) {
          // no-op
        },
      },
      headers: {
        get(key: string) {
          return headerList.get(key) ?? undefined;
        },
      },
    }
  );

  return supabase;
}

// Legacy alias for older code that imports { createClient } from this module.
export async function createClient() {
  return createSupabaseServerClient();
}

// Optional additional aliases if your code used different names before:
export const getServerClient = createSupabaseServerClient;
export const supabaseServerClient = createSupabaseServerClient;
