import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

async function _createServerSupabaseClient() {
  // In Next.js 15, cookies() is async → must await
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({
          name,
          value: "",
          ...options,
          expires: new Date(0),
        });
      },
    },
  });
}

export async function createServerSupabaseClient() {
  return _createServerSupabaseClient();
}

// Back-compat alias
export const createSupabaseServerClient = _createServerSupabaseClient;
