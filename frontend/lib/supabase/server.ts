import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the server."
    );
  }

  const cookieStore = cookies() as any;
  const hdrs = headers() as any;

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        try { return cookieStore.get(name)?.value ?? undefined; } catch { return undefined; }
      },
      set(name: string, value: string, options: CookieOptions) {
        try { cookieStore.set({ name, value, ...options }); } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try { cookieStore.set({ name, value: "", ...options }); } catch {}
      },
    },
    global: typeof hdrs?.entries === "function" ? { headers: Object.fromEntries(hdrs.entries()) } : undefined,
  });
}
export function createServerSupabaseClient() { return createClient(); }
