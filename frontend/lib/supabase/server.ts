// Server-side Supabase client for Next.js App Router
// Works in route handlers and server components.

import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export function createClient() {
  const cookieStore = cookies();

  // Render/Next often needs explicit getters/setters for cookies to support auth
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
          } catch {
            // in edge runtimes or some contexts this may be a no-op; that's fine
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // no-op fallback
          }
        },
      },
      // Forward headers if you want RLS policies that depend on IP/UA, optional:
      global: { headers: Object.fromEntries(headers().entries()) },
    }
  );
}
