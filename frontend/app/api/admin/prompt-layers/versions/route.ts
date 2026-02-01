import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/lib/supa";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * GET /api/admin/prompt-layers/versions?key=BASE_UNIVERSAL_ENFORCEMENT&limit=20
 * Returns version history for the given layer key (append-only prompt_layer_versions).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    let supabase: ReturnType<typeof getAdmin>;
    try {
      supabase = getAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "service_role required for prompt_layer_versions" }, { status: 503 });
    }
    const key = req.nextUrl.searchParams.get("key")?.trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10)));
    if (!key) return NextResponse.json({ ok: false, error: "key required" }, { status: 400 });

    const { data, error } = await supabase
      .from("prompt_layer_versions")
      .select("id, layer_key, body, meta, created_at")
      .eq("layer_key", key)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, versions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
