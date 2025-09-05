import { NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies: cookieStore });
  const {
    data: { session, user },
    error,
  } = await supabase.auth.getSession();

  const names = cookieStore().getAll().map((c) => c.name);

  return NextResponse.json({
    ok: true,
    user: user ?? null,
    session_present: Boolean(session),
    error: error?.message ?? null,
    cookies_seen: names,
  });
}
