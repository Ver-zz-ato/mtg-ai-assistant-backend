import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

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

function sanitize(obj: any): any {
  if (!obj) return {};
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "user_id" || k === "thread_id" || k === "deck_id") continue;
    if (typeof v === "string" && v.length > 5000) out[k] = v.slice(0, 5000) + "...";
    else out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { count = 10, route_filter } = body;

    const n = Math.min(Math.max(1, parseInt(String(count)) || 10), 50);

    let query = supabase
      .from("ai_usage")
      .select("id, route, prompt_preview, response_preview, created_at")
      .not("route", "is", null)
      .order("created_at", { ascending: false })
      .limit(n * 3);

    if (route_filter && typeof route_filter === "string") {
      query = query.eq("route", route_filter);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const usage = (rows || []).filter((r) => r.prompt_preview || r.response_preview).slice(0, n);
    const created: string[] = [];

    for (const r of usage) {
      const { data: existing } = await supabase
        .from("ai_human_reviews")
        .select("id")
        .eq("meta->>ai_usage_id", r.id)
        .maybeSingle();

      if (existing) continue;

      const { data: inserted, error: insertErr } = await supabase
        .from("ai_human_reviews")
        .insert({
          source: "production_sample",
          route: r.route,
          input: sanitize({ prompt_preview: r.prompt_preview }),
          output: (r as any).response_preview || "",
          labels: {},
          status: "pending",
          meta: { ai_usage_id: r.id },
        })
        .select("id")
        .single();

      if (!insertErr && inserted) {
        created.push(inserted.id);
      }
    }

    return NextResponse.json({
      ok: true,
      sampled: usage.length,
      created: created.length,
      ids: created,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
