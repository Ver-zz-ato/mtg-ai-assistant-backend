export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForApi } from "@/lib/server-admin";

export async function GET(req: Request) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const supabase = await createClient();

  const cookieHeader = typeof req.headers?.get === 'function' ? (req.headers.get('cookie') || '') : '';
  const envUrlSet = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKeySet = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  const payload: Record<string, unknown> = {
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
