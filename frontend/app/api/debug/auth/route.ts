export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies: () => cookies() });

  const cookieHeader = typeof req.headers?.get === 'function' ? (req.headers.get('cookie') || '') : '';
  const envUrlSet = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKeySet = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  const payload: any = {
    ok: true,
    hasCookieHeader: !!cookieHeader,
    cookieLen: cookieHeader.length,
    envUrlSet,
    envKeySet,
    sessionError: sessErr?.message || null,
    userError: userErr?.message || null,
    userId: userData?.user?.id || null,
    sessionPresent: !!sessionData?.session,
  };

  return NextResponse.json(payload);
}
