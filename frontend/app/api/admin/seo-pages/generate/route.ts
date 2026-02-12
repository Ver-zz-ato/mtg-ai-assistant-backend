import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import { generateSeoPages } from "@/lib/seo/generate-pages";

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

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "500", 10) || 500, 500);
    const { generated, slugs } = await generateSeoPages(admin, limit);

    if (generated === 0) {
      return NextResponse.json({
        ok: true,
        generated: 0,
        message: "No new candidates. All slugs already exist or no queries matched.",
      });
    }

    return NextResponse.json({
      ok: true,
      generated,
      slugs,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
