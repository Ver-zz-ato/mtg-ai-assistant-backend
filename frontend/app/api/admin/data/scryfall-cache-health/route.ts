import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(user: { id?: string; email?: string } | null): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * Read-only snapshot for scryfall_cache hygiene. Full duplicate / drift queries: `db/scryfall_cache_health_audit.sql`.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const { count: totalRows, error: e1 } = await admin
      .from("scryfall_cache")
      .select("*", { count: "exact", head: true });

    const { count: nullNameNorm, error: e2 } = await admin
      .from("scryfall_cache")
      .select("*", { count: "exact", head: true })
      .is("name_norm", null);

    const { count: missingImages, error: e3 } = await admin
      .from("scryfall_cache")
      .select("*", { count: "exact", head: true })
      .is("normal", null)
      .is("small", null);

    const { count: missingTypeLine, error: e4 } = await admin
      .from("scryfall_cache")
      .select("*", { count: "exact", head: true })
      .is("type_line", null);

    const { count: missingOracle, error: e5 } = await admin
      .from("scryfall_cache")
      .select("*", { count: "exact", head: true })
      .is("oracle_text", null);

    if (e1 || e2 || e3 || e4 || e5) {
      return NextResponse.json(
        {
          ok: false,
          error: e1?.message || e2?.message || e3?.message || e4?.message || e5?.message || "count_failed",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      totalRows: totalRows ?? 0,
      rowsWithNullNameNorm: nullNameNorm ?? 0,
      rowsMissingBothSmallAndNormal: missingImages ?? 0,
      rowsWithNullTypeLine: missingTypeLine ?? 0,
      rowsWithNullOracleText: missingOracle ?? 0,
      note:
        "Column-vs-column checks (e.g. name <> name_norm) and duplicate (set,collector_number) require SQL — see db/scryfall_cache_health_audit.sql in repo.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
