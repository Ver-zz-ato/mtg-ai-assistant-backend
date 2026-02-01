import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Parse cookie value: if it starts with "base64-", decode base64 then use as string; otherwise return as-is. On failure, return undefined (treat as absent). */
function getCookieValue(value: string | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  if (value.startsWith("base64-")) {
    try {
      const decoded = Buffer.from(value.slice(7), "base64").toString("utf8");
      try {
        JSON.parse(decoded);
        return decoded;
      } catch {
        return value;
      }
    } catch {
      return undefined;
    }
  }
  return value;
}

export async function getServerSupabase() {
  const cookieStore: any = await cookies();
  const get = (name: string) => getCookieValue(cookieStore.get?.(name)?.value);
  const set = (_name: string, _value: string, _options: any) => {};
  const remove = (_name: string, _options: any) => {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, anon, { cookies: { get, set, remove } });
}
