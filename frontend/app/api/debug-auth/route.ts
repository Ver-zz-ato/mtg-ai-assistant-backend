import { NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Make sure we run in the Node runtime (Supabase libs expect Node APIs)
export const runtime = "nodejs";

export async function GET() {
  // In Next 15 this may be a Promise; await to be safe
  const jar = await (cookieStore() as any);

  const supabase = createRouteHandlerClient({ cookies: cookieStore });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const allCookies = typeof jar.getAll === "function" ? jar.getAll() : [];
  const cookie_names = allCookies.map((c: any) => c.name);
  const sb_cookie_samples = allCookies
    .filter((c: any) => String(c.name).startsWith("sb-"))
    .slice(0, 3)
    .map((c: any) => ({
      name: c.name,
      value_preview: String(c.value ?? "").slice(0, 24),
    }));

  return NextResponse.json({
    ok: true,
    session_present: Boolean(session),
    user: session?.user ?? null,
    error: error?.message ?? null,
    cookie_names,
    sb_cookie_samples,
  });
}
