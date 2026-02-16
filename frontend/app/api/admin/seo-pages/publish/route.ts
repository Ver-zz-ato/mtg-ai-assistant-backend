import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const minPriority = parseInt(req.nextUrl.searchParams.get("minPriority") || "0", 10);
    const minQuality = parseInt(req.nextUrl.searchParams.get("minQuality") || "1", 10);
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "25", 10);

    const { data: draftRows, error: selErr } = await admin
      .from("seo_pages")
      .select("slug")
      .eq("status", "draft")
      .gte("priority", minPriority)
      .gte("quality_score", minQuality)
      .order("priority", { ascending: false })
      .limit(limit);

    if (selErr || !draftRows?.length) {
      return NextResponse.json({
        ok: true,
        published: 0,
        slugs: [],
        message: "No draft pages to publish.",
      });
    }

    const slugs = (draftRows as { slug: string }[]).map((r) => r.slug);
    const { error: updErr } = await admin
      .from("seo_pages")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .in("slug", slugs);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    const { pingGoogleSitemap } = await import("@/lib/seo/pingGoogle");
    pingGoogleSitemap().catch(() => {});

    return NextResponse.json({
      ok: true,
      published: slugs.length,
      slugs,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
