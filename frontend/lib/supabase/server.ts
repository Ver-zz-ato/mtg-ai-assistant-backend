// Server-side Supabase client for Next.js App Router
// Works in route handlers and server components.
// Note: Next's `cookies()` typing can be Promise-like in some environments.
// We cast to `any` to normalize the interface for @supabase/ssr.

import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/** Primary server-side Supabase client creator */
export function createClient() {
  // In some Next versions/runtimes, cookies()/headers() are typed oddly.
  const cookieStore = cookies() as any;
  const hdrs = headers() as any;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          try {
            return cookieStore.get(name)?.value ?? undefined;
          } catch {
            return undefined;
          }
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // noop in runtimes that disallow setting here
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // noop
          }
        },
      },
      // Optional: forward request headers when available
      global: {
        headers:
          typeof hdrs?.entries === "function"
            ? Object.fromEntries(hdrs.entries())
            : undefined,
      },
    }
  );
}

/** Back-compat shim for older imports */
export function createServerSupabaseClient() {
  return createClient();
}
