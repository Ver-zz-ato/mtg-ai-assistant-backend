// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client wired to Next.js cookies.
 * Lint-safe: no `any` types in the cookie adapters.
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(
        name: string,
        value: string,
        // accept any option shape without using `any`
        options?: Record<string, unknown>
      ) {
        // Next's cookies().set allows a variety of cookie options
        // We forward them through; type cast stays on our side.
        cookieStore.set(name, value, options as undefined);
      },
      remove(name: string, options?: Record<string, unknown>) {
        cookieStore.set(name, "", { ...(options ?? {}), maxAge: 0 } as undefined);
      },
    },
  });
}
