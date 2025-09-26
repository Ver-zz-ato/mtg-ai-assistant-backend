export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserIdFromCookie } from "../../../../lib/supa";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const env = {
    hasUrl: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    hasAnon: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
    hasServiceKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE),
  };

  const cs: any = await cookies();
  const all = typeof cs?.getAll === 'function' ? cs.getAll() : [];
  const names = all.map((c: any) => c.name);
  const auth = all.find((c: any) => /^sb-.*-auth-token(?:\..+)?$/.test(c.name));
  const rawMeta = auth?.value ? { length: auth.value.length, prefix: (auth.value as string).slice(0, 24) } : null;

  const cookieUserId = getUserIdFromCookie(cs);

  let helperUserId: string | null = null;
  try {
    const client = createRouteHandlerClient({ cookies: cs } as any);
    const { data } = await (client as any).auth.getUser();
    helperUserId = (data as any)?.user?.id ?? null;
  } catch {}

  return NextResponse.json({
    env,
    cookieDebug: { names, rawMeta },
    user: { cookieUserId, helperUserId },
    note: "cookieUserId uses base64-aware parser; if present, backend can satisfy FK and RLS again.",
  });
}
