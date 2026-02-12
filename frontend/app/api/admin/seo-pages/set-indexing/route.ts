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

    const body = await req.json().catch(() => ({}));
    const { slug, indexing } = body;
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
    }
    if (indexing !== "index" && indexing !== "noindex") {
      return NextResponse.json({ ok: false, error: "indexing must be index or noindex" }, { status: 400 });
    }

    const { error } = await admin.from("seo_pages").update({ indexing, updated_at: new Date().toISOString() }).eq("slug", slug);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug, indexing });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
