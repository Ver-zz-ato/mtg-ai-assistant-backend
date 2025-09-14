// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function maybeDecodeBase64Cookie(val?: string | null): string | undefined {
  if (!val) return undefined;
  if (val.startsWith("base64-")) {
    try {
      const decoded = Buffer.from(val.slice(7), "base64").toString("utf8");
      return decoded;
    } catch {
      // fall through to raw
    }
  }
  return val;
}

export async function createClient() {
  const cookieStore = await cookies(); // Next 15 requires await

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const raw = cookieStore.get(name)?.value;
          // Some environments prefix JSON cookies with "base64-...".
          // Decode so internal JSON.parse in @supabase/ssr doesn't warn.
          return maybeDecodeBase64Cookie(raw);
        },
        set(name: string, value: string, options: any) {
          // Next.js cookies are immutable in route handlers.
        },
        remove(name: string, options: any) {
          // Same here.
        },
      },
    }
  );

  return supabase;
}
