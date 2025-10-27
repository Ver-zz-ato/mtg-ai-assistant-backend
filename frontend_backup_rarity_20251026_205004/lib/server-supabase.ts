// Unified server-side Supabase client using '@supabase/ssr' with explicit cookie adapter.
// This avoids the Next 15 cookies() sync/async gotchas and ensures getUser() sees the JWT.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Async variant for route handlers — await cookies() to avoid Next 15 sync dynamic API warnings.
export async function createClient() {
  const cookieStore: any = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    },
  );

  return supabase;
}

export async function getServerSupabase() {
  const cookieStore: any = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    },
  );

// Dev diagnostics removed to keep test/dev console clean. Toggle with NEXT_DEBUG_AUTH=1 if needed.
  if (process.env.NEXT_DEBUG_AUTH === '1') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const ref = (() => { try { return new URL(url).host.split(".")[0]; } catch { return ""; } })();
    const expected = ref ? `sb-${ref}-auth-token` : "";
    const names = Array.from(cookieStore?.getAll?.() ?? []).map((c: any) => c.name);
    const hasExpected = expected ? names.includes(expected) : false;
    console.log(JSON.stringify({ tag: "auth_debug", expectedCookie: expected, hasExpected, cookieNames: names }));
  }

  return supabase;
}

// Alias exported name expected by some legacy routes
export const getSupabaseServer = getServerSupabase;
