import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runPriceSnapshotFromScryfallBulk } from "@/lib/server/priceSnapshotFromScryfallBulk";

export const runtime = "nodejs";
export const maxDuration = 600; // match bulk download + upsert (was 300; bulk needs more time)

function isAdmin(user: any): boolean {
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

async function runSnapshot(req: NextRequest) {
  try {
    const isVercelCron = !!req.headers.get("x-vercel-cron");
    const key = req.nextUrl.searchParams.get("key") || "";
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    if (!(isVercelCron || (cronKey && key && key === cronKey))) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    try {
      await supabase.from("app_config").upsert(
        { key: "job:last:price_snapshot_bulk", value: new Date().toISOString() },
        { onConflict: "key" }
      );
      await supabase.from("admin_audit").insert({ actor_id: "cron", action: "cron_price_snapshot", target: result.snapshot_date });
    } catch {}

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      snapshot_date: result.snapshot_date,
      mode: "bulk",
      unique_cards: result.unique_cards,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  console.log("📈 Price snapshot endpoint called");

  try {
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("🚀 Authorization successful, starting price snapshot (Scryfall bulk)...");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) {
      return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });
    }
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    try {
      await supabase.from("app_config").upsert(
        { key: "job:last:price_snapshot_bulk", value: new Date().toISOString() },
        { onConflict: "key" }
      );
      await supabase.from("admin_audit").insert({ actor_id: "cron", action: "cron_price_snapshot", target: result.snapshot_date });
    } catch {}

    console.log(`✅ Price snapshot completed: ${result.inserted} rows, ${result.unique_cards} unique names`);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      snapshot_date: result.snapshot_date,
      mode: "bulk",
      unique_cards: result.unique_cards,
    });
  } catch (error: any) {
    console.error("❌ Price snapshot failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "snapshot_failed",
      },
      { status: 500 }
    );
  }
}
