import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Inject Supabase session cookies into every request
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();

  return res;
}
