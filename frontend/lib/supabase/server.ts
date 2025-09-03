import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Primary server-side Supabase client creator for App Router.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
      global: { headers: Object.fromEntries(headers().entries()) },
    }
  );
}

/**
 * Backwards-compat shim for files that still import:
 *   import { createServerSupabaseClient } from "@/lib/supabase/server";
 */
export function createServerSupabaseClient() {
  return createClient();
}
