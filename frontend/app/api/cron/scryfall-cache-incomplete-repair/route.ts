import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  isScryfallCacheRowIncomplete,
  mergeScryfallCacheRowFromApiCard,
  normalizeScryfallCacheName,
} from "@/lib/server/scryfallCacheRow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRYFALL_COLLECTION_MAX = 75;

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

async function fetchCollection(identifiers: { name: string }[]): Promise<{
  data: Record<string, unknown>[];
  not_found: unknown[];
}> {
  const r = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
      "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
    },
    body: JSON.stringify({ identifiers }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as {
    data?: Record<string, unknown>[];
    not_found?: unknown[];
  };
  return {
    data: Array.isArray(j.data) ? j.data : [],
    not_found: Array.isArray(j.not_found) ? j.not_found : [],
  };
}

function log(msg: string, meta?: Record<string, unknown>) {
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[scryfall_cache_incomplete_repair] ${msg}${suffix}`);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST with x-cron-key or admin session. Query: batchSize (default 300, max 500), after=<PK string> for resume.",
    source: "Scryfall /cards/collection + mergeScryfallCacheRowFromApiCard",
    docs: "db/SCRYFALL_CACHE_INCOMPLETE_REPAIR.md",
  });
}

export async function POST(req: NextRequest) {
  const cronKeyHeader = req.headers.get("x-cron-key") || "";
  const url = new URL(req.url);
  const cronKeyQuery = url.searchParams.get("key") || "";
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const vercelId = req.headers.get("x-vercel-id");

  let authorized = false;
  let actor: string | null = null;

  if (vercelId || (cronKey && cronKeyHeader === cronKey) || (cronKey && cronKeyQuery === cronKey)) {
    authorized = true;
    actor = "cron";
  }
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
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 503 });
  }

  const batchSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get("batchSize") || "300", 10) || 300));
  const after = (url.searchParams.get("after") || "").trim();

  // PostgREST: type_line IS NULL OR oracle_text IS NULL OR (small IS NULL AND normal IS NULL)
  let q = admin
    .from("scryfall_cache")
    .select("*")
    .or("type_line.is.null,oracle_text.is.null,and(small.is.null,normal.is.null)")
    .order("name", { ascending: true })
    .limit(batchSize);

  if (after) {
    q = q.gt("name", after);
  }

  const { data: page, error } = await q;
  if (error) {
    log("query_failed", { error: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rawRows = (page || []) as Record<string, unknown>[];
  const candidates = rawRows.filter(isScryfallCacheRowIncomplete);

  log("batch_selected", {
    batchSizeRequested: batchSize,
    rawFromDb: rawRows.length,
    after: after || null,
    candidatesIncomplete: candidates.length,
  });

  if (candidates.length === 0) {
    const nextAfter = rawRows.length ? String(rawRows[rawRows.length - 1].name ?? "") : after;
    return NextResponse.json({
      ok: true,
      merged: 0,
      skippedMismatch: 0,
      notFoundIdentifiers: 0,
      scryfallRequests: 0,
      candidates: 0,
      rawFromDb: rawRows.length,
      nextAfter: nextAfter || after,
      message: rawRows.length === 0 ? "no_rows_in_range" : "no_incomplete_rows_after_filter",
    });
  }

  const byPk = new Map(candidates.map((r) => [String(r.name ?? ""), r]));
  const identifiers = candidates.map((r) => ({ name: String(r.name ?? "") }));

  let totalNotFound: unknown[] = [];
  const allCards: Record<string, unknown>[] = [];
  let scryfallRequests = 0;

  for (let i = 0; i < identifiers.length; i += SCRYFALL_COLLECTION_MAX) {
    const chunk = identifiers.slice(i, i + SCRYFALL_COLLECTION_MAX);
    scryfallRequests++;
    const { data: cards, not_found } = await fetchCollection(chunk);
    allCards.push(...cards);
    totalNotFound = totalNotFound.concat(not_found);
  }

  if (totalNotFound.length) {
    log("scryfall_not_found", { count: totalNotFound.length, sample: totalNotFound.slice(0, 5) });
  }

  const upserts: Record<string, unknown>[] = [];
  let skippedMismatch = 0;

  for (const card of allCards) {
    const pk = normalizeScryfallCacheName(String(card.name ?? ""));
    const existing = byPk.get(pk);
    if (!existing) continue;
    const merged = mergeScryfallCacheRowFromApiCard(existing, card as Record<string, unknown>, {
      route: "/api/cron/scryfall-cache-incomplete-repair",
    });
    if (!merged) {
      skippedMismatch++;
      continue;
    }
    upserts.push(merged);
  }

  const dedupedByName = new Map<string, Record<string, unknown>>();
  for (const row of upserts) {
    const n = String(row.name ?? "");
    if (n) dedupedByName.set(n, row);
  }
  const upsertRows = Array.from(dedupedByName.values());

  if (upsertRows.length > 0) {
    const { error: upErr } = await admin.from("scryfall_cache").upsert(upsertRows, { onConflict: "name" });
    if (upErr) {
      log("upsert_failed", { error: upErr.message });
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
  }

  const lastNameInBatch =
    rawRows.length > 0 ? String(rawRows[rawRows.length - 1].name ?? "") : after;

  log("batch_complete", {
    merged: upsertRows.length,
    skippedMismatch,
    notFoundIdentifiers: totalNotFound.length,
    scryfallRequests,
    duplicatePkInBatch: upserts.length - upsertRows.length,
    nextAfter: lastNameInBatch,
  });

  try {
    await admin.from("app_config").upsert(
      {
        key: "job:last:scryfall_cache_incomplete_repair",
        value: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    await admin.from("admin_audit").insert({
      action: "scryfall_cache_incomplete_repair",
      target: String(upsertRows.length),
      payload: {
        merged: upsertRows.length,
        candidates: candidates.length,
        actor: actor || "cron",
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    batchSizeRequested: batchSize,
    rawFromDb: rawRows.length,
    candidates: candidates.length,
    merged: upsertRows.length,
    duplicatePkInBatch: upserts.length - upsertRows.length,
    skippedMismatch,
    notFoundIdentifiers: totalNotFound.length,
    scryfallCardsReturned: allCards.length,
    scryfallRequests,
    nextAfter: lastNameInBatch,
  });
}
