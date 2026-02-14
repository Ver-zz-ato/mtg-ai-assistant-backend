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
    const { slug, slugs, indexing } = body;
    const slugList: string[] = slugs && Array.isArray(slugs)
      ? slugs.filter((s: unknown) => typeof s === "string").slice(0, 100)
      : slug && typeof slug === "string"
        ? [slug]
        : [];
    if (slugList.length === 0) {
      return NextResponse.json({ ok: false, error: "slug or slugs required" }, { status: 400 });
    }
    if (indexing !== "index" && indexing !== "noindex") {
      return NextResponse.json({ ok: false, error: "indexing must be index or noindex" }, { status: 400 });
    }

    const { error } = await admin.from("seo_pages").update({ indexing, updated_at: new Date().toISOString() }).in("slug", slugList);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slugs: slugList, indexing, updated: slugList.length });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
