import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to Next.js App Router cookies.
 * Some Next 15 setups type `cookies()` as Promise<ReadonlyRequestCookies>.
 * To avoid async export surfaces, we lazily call `nextCookies()` inside each cookie op.
 */
function _make(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        try {
          const store: any = (nextCookies as any)();
          // Handle both sync and async stores
          if (store && typeof store.get === "function") {
            return store.get(name)?.value;
          }
          return undefined;
        } catch {
          return undefined;
        }
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          const store: any = (nextCookies as any)();
          if (store && typeof store.set === "function") {
            store.set({ name, value, ...options });
          }
        } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try {
          const store: any = (nextCookies as any)();
          if (store && typeof store.set === "function") {
            store.set({ name, value: "", ...options });
          }
        } catch {}
      },
    },
  });

  return client as unknown as SupabaseClient;
}

export function getSupabaseServer(): SupabaseClient {
  return _make();
}

/** Back-compat: several routes import { createClient } from this module. */
export function createClient(): SupabaseClient {
  return _make();
}
