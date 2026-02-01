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

/** Use service-role client for prompt_layers (required after RLS + REVOKE on anon/authenticated). */
function getSupabaseForLayers() {
  try {
    return getAdmin();
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/prompt-layers?key=BASE_UNIVERSAL_ENFORCEMENT
 * Returns body and meta for the given layer key.
 * GET /api/admin/prompt-layers (no key) returns list of all layer keys and updated_at.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const supabase = getSupabaseForLayers();
    if (!supabase) return NextResponse.json({ ok: false, error: "service_role required for prompt_layers" }, { status: 503 });
    const key = req.nextUrl.searchParams.get("key")?.trim();
    if (!key) {
      const { data: list, error } = await supabase.from("prompt_layers").select("key, updated_at").order("key");
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, layers: list ?? [] });
    }
    const { data, error } = await supabase
      .from("prompt_layers")
      .select("key, body, meta, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "layer not found" }, { status: 404 });
    return NextResponse.json({ ok: true, key: data.key, body: data.body, meta: data.meta ?? {}, updated_at: data.updated_at });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/prompt-layers
 * Body: { key: string, body: string, meta?: object }
 * Upserts prompt_layers and appends to prompt_layer_versions (version history).
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await getServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const supabase = getSupabaseForLayers();
    if (!supabase) return NextResponse.json({ ok: false, error: "service_role required for prompt_layers" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const layerBody = typeof body.body === "string" ? body.body : "";
    const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
    if (!key) return NextResponse.json({ ok: false, error: "key required" }, { status: 400 });

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase
      .from("prompt_layers")
      .upsert({ key, body: layerBody, meta, updated_at: now }, { onConflict: "key" });
    if (upsertError) return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
    // History is appended by DB trigger log_prompt_layer_version (no manual insert here)
    return NextResponse.json({ ok: true, key, updated_at: now });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
