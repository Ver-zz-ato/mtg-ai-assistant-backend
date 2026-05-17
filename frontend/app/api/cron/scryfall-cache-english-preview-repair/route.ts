import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { fetchEnglishCardImages } from "@/lib/scryfall";
import { logUnauthorizedCronAttempt, verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

function sameImages(
  current: { small?: string | null; normal?: string | null; art_crop?: string | null },
  next: { small?: string | null; normal?: string | null; art_crop?: string | null }
): boolean {
  return (
    (current.small || null) === (next.small || null) &&
    (current.normal || null) === (next.normal || null) &&
    (current.art_crop || null) === (next.art_crop || null)
  );
}

function log(msg: string, meta?: Record<string, unknown>) {
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[scryfall_cache_english_preview_repair] ${msg}${suffix}`);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST with Authorization: Bearer <CRON_SECRET> or admin session. Query: batchSize (default 100, max 250), after=<PK string> for resume.",
    source: "Scryfall search lang:en + partial image upsert",
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  let authorized = verifyCronRequest(req, {
    routePath: "/api/cron/scryfall-cache-english-preview-repair",
    logUnauthorizedOnFailure: false,
  });
  let actor: string | null = authorized ? "cron" : null;
  if (!authorized) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && isAdmin(user)) {
        authorized = true;
        actor = user.id as string;
      }
    } catch {
      /* ignore */
    }
  }

  if (!authorized) {
    logUnauthorizedCronAttempt(req, { routePath: "/api/cron/scryfall-cache-english-preview-repair" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 503 });
  }

  const batchSize = Math.min(250, Math.max(1, parseInt(url.searchParams.get("batchSize") || "100", 10) || 100));
  const after = (url.searchParams.get("after") || "").trim();

  let query = admin
    .from("scryfall_cache")
    .select("name, printed_name, small, normal, art_crop")
    .not("printed_name", "is", null)
    .order("name", { ascending: true })
    .limit(batchSize);

  if (after) {
    query = query.gt("name", after);
  }

  const { data, error } = await query;
  if (error) {
    log("query_failed", { error: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const upserts: Array<Record<string, unknown>> = [];
  const sampleUpdated: string[] = [];
  let noEnglishMatch = 0;
  let unchanged = 0;

  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    const enInfo = await fetchEnglishCardImages(name);
    if (!enInfo?.small && !enInfo?.normal && !enInfo?.art_crop) {
      noEnglishMatch++;
      continue;
    }
    if (
      sameImages(
        { small: row.small, normal: row.normal, art_crop: row.art_crop },
        { small: enInfo.small, normal: enInfo.normal, art_crop: enInfo.art_crop }
      )
    ) {
      unchanged++;
      continue;
    }
    upserts.push({
      name,
      name_norm: name,
      small: enInfo.small ?? null,
      normal: enInfo.normal ?? null,
      art_crop: enInfo.art_crop ?? null,
      updated_at: new Date().toISOString(),
    });
    if (sampleUpdated.length < 10) {
      sampleUpdated.push(name);
    }
  }

  if (upserts.length > 0) {
    const { error: upErr } = await admin.from("scryfall_cache").upsert(upserts, { onConflict: "name" });
    if (upErr) {
      log("upsert_failed", { error: upErr.message });
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
  }

  const lastNameInBatch = rows.length > 0 ? String(rows[rows.length - 1]?.name || after) : after;

  log("batch_complete", {
    scanned: rows.length,
    updated: upserts.length,
    unchanged,
    noEnglishMatch,
    nextAfter: lastNameInBatch || null,
  });

  try {
    await admin.from("app_config").upsert(
      {
        key: "job:last:scryfall_cache_english_preview_repair",
        value: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    await admin.from("admin_audit").insert({
      actor_id: actor || "cron",
      action: "scryfall_cache_english_preview_repair",
      target: String(upserts.length),
      payload: {
        scanned: rows.length,
        updated: upserts.length,
        unchanged,
        noEnglishMatch,
        after: after || null,
        nextAfter: lastNameInBatch || null,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    updated: upserts.length,
    unchanged,
    noEnglishMatch,
    nextAfter: lastNameInBatch || null,
    sampleUpdated,
  });
}
