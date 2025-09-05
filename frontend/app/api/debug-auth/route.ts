import { NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies: cookieStore });
  const { data: { session }, error } = await supabase.auth.getSession();

  const allCookies = cookieStore().getAll();
  const cookieNames = allCookies.map(c => c.name);
  const sbCookies = allCookies.filter(c => c.name.startsWith("sb-"));

  return NextResponse.json({
    ok: true,
    session_present: Boolean(session),
    user: session?.user ?? null,
    error: error?.message ?? null,
    cookie_names: cookieNames,
    sb_cookie_samples: sbCookies.slice(0, 3).map(c => ({
      name: c.name,
      // only show first 24 chars to avoid leaking secrets
      value_preview: (c.value ?? "").slice(0, 24)
    })),
  });
}
