
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getServerSupabase() {
  const cookieStore: any = await cookies();
  const get = (name: string) => cookieStore.get?.(name)?.value;
  const set = (_name: string, _value: string, _options: any) => {};
  const remove = (_name: string, _options: any) => {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, anon, { cookies: { get, set, remove } });
}
