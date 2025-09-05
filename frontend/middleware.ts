import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  try {
    const supabase = createMiddlewareClient({ req, res });
    // This attaches/refreshes sb-* cookies when valid
    await supabase.auth.getSession();
  } catch (e) {
    // Don’t block the request if some cookie is malformed
    console.error("Supabase middleware getSession error:", e);
  }
  return res;
}
