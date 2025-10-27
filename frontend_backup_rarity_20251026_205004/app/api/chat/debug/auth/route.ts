
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "../../../_lib/supabase";

export async function GET() {
  try {
    const cookieStore: any = await cookies();
    const names = Array.from(cookieStore?.getAll?.() ?? []).map((c: any) => c.name);
    const hasSb = names.some((n: string) => n.includes("-auth-token"));
    const supabase = await getServerSupabase();
    const { data: { session }, error: sErr } = await supabase.auth.getSession();
    const { data: { user }, error: uErr } = await supabase.auth.getUser();
    return NextResponse.json({
      ok: true,
      cookies: { names, hasAuthToken: hasSb },
      session: session ? { user: session.user?.id, expires_at: (session as any).expires_at } : null,
      user: user ? { id: user.id, email: (user as any).email } : null,
      errors: { session: sErr?.message ?? null, user: uErr?.message ?? null }
    });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
