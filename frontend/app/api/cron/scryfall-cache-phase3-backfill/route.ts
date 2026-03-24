import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  mergeScryfallCacheRowFromApiCard,
  needsPhase3Backfill,
  normalizeScryfallCacheName,
} from "@/lib/server/scryfallCacheRow";

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "POST with x-cron-key or admin session. Query: batchSize (max 75), maxPages, after (name cursor).",
    source: "Scryfall /cards/collection + mergeScryfallCacheRowFromApiCard",
    docs: "db/SCRYFALL_CACHE_PHASE3.md",
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

  const batchSize = Math.min(75, Math.max(1, parseInt(url.searchParams.get("batchSize") || "75", 10) || 75));
  const maxPages = Math.min(50, Math.max(1, parseInt(url.searchParams.get("maxPages") || "15", 10) || 15));
  let after = (url.searchParams.get("after") || "").trim();

  const candidates: Record<string, unknown>[] = [];
  let scanCursor = after;
  let pagesScanned = 0;

  while (candidates.length < batchSize && pagesScanned < maxPages) {
    let q = admin
      .from("scryfall_cache")
      .select(
        "name, name_norm, type_line, oracle_text, small, normal, legalities, is_land, is_creature, is_instant, is_sorcery, is_enchantment, is_artifact, is_planeswalker, colors, keywords, power, toughness, loyalty"
      )
      .order("name", { ascending: true })
      .limit(200);

    if (scanCursor) {
      q = q.gt("name", scanCursor);
    }

    const { data: page, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const rows = (page || []) as Record<string, unknown>[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (needsPhase3Backfill(row)) candidates.push(row);
      if (candidates.length >= batchSize) break;
    }

    scanCursor = String(rows[rows.length - 1].name ?? "");
    pagesScanned++;
    if (rows.length < 200) break;
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      merged: 0,
      skippedMismatch: 0,
      notFoundIdentifiers: 0,
      scannedPages: pagesScanned,
      nextAfter: scanCursor || after,
      message: "no_rows_needing_backfill_in_scan_range",
    });
  }

  const identifiers = candidates.map((r) => ({ name: String(r.name ?? "") }));
  const { data: cards, not_found } = await fetchCollection(identifiers);

  const byPk = new Map(candidates.map((r) => [String(r.name ?? ""), r]));
  const upserts: Record<string, unknown>[] = [];
  let skippedMismatch = 0;

  for (const card of cards) {
    const pk = normalizeScryfallCacheName(String(card.name ?? ""));
    const existing = byPk.get(pk);
    if (!existing) continue;
    const merged = mergeScryfallCacheRowFromApiCard(existing, card);
    if (!merged) {
      skippedMismatch++;
      continue;
    }
    upserts.push(merged);
  }

  // Postgres upsert: one row per PK — collection can return duplicate oracle names in one response.
  const dedupedByName = new Map<string, Record<string, unknown>>();
  for (const row of upserts) {
    const n = String(row.name ?? "");
    if (n) dedupedByName.set(n, row);
  }
  const upsertRows = Array.from(dedupedByName.values());

  if (upsertRows.length > 0) {
    const { error: upErr } = await admin.from("scryfall_cache").upsert(upsertRows, { onConflict: "name" });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
  }

  try {
    await admin.from("app_config").upsert(
      {
        key: "job:last:scryfall_cache_phase3_backfill",
        value: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    await admin.from("admin_audit").insert({
      action: "scryfall_cache_phase3_backfill",
      target: String(upsertRows.length),
      payload: { merged: upsertRows.length, actor: actor || "cron" },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    batchSizeRequested: batchSize,
    candidates: candidates.length,
    merged: upsertRows.length,
    duplicatePkInBatch: upserts.length - upsertRows.length,
    skippedMismatch,
    notFoundIdentifiers: not_found.length,
    scryfallCardsReturned: cards.length,
    scannedPages: pagesScanned,
    nextAfter: scanCursor,
  });
}
