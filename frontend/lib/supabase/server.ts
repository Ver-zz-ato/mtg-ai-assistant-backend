import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function _createServerSupabaseClient() {
  const cookieStore = cookies();

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
          value: '',
          ...options,
          expires: new Date(0),
        });
      },
    },
  });
}

/**
 * Canonical export: use this in all new code.
 */
export function createServerSupabaseClient() {
  return _createServerSupabaseClient();
}

/**
 * Back-compat alias: some files might still import the old name.
 * Keeping this prevents build failures if the old import lingers anywhere.
 */
export const createSupabaseServerClient = _createServerSupabaseClient;
