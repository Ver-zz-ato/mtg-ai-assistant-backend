export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getToken() {
  const jar = cookies();
  const all = (jar as any).getAll?.() ?? [];
  const c = all.find((x:any) => x.name.endsWith("-auth-token"));
  if (!c?.value) return null;
  const raw = c.value.startsWith("base64-") ? c.value.slice(7) : c.value;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch { return null; }
}

export async function GET() {
  const token = getToken();
  if (!token) return NextResponse.json({ ok:false, token_present:false });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data } = await sb.auth.getUser();
  return NextResponse.json({
    ok: true,
    token_present: true,
    user_id: data.user?.id ?? null
  });
}
