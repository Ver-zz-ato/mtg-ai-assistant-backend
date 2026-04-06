/**
 * Admin/dev: MTG legality sync health (app_config + scryfall_cache samples).
 */
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import { readMtgLegalitySyncStatus, MTG_LEGALITY_SYNC_STATUS_KEY } from "@/lib/data/mtg-legality-refresh";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { evaluateCardRecommendationLegality } from "@/lib/deck/recommendation-legality";
import { bannedDataToMaps, type BannedCardsData } from "@/lib/data/get-banned-cards";

function isBannedPayload(v: unknown): v is BannedCardsData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.Commander) && Array.isArray(o.Modern);
}

export const runtime = "nodejs";

export async function GET() {
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
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 503 });
    }

    const syncStatus = await readMtgLegalitySyncStatus(admin);

    const { data: bannedRow } = await admin
      .from("app_config")
      .select("value, updated_at")
      .eq("key", "banned_cards")
      .maybeSingle();

    const { data: jobRow } = await admin
      .from("app_config")
      .select("value, updated_at")
      .eq("key", "job:last:mtg-legality-refresh")
      .maybeSingle();

    const { data: statusRow } = await admin
      .from("app_config")
      .select("value, updated_at")
      .eq("key", MTG_LEGALITY_SYNC_STATUS_KEY)
      .maybeSingle();

    const sampleNames = ["sol ring", "lightning bolt", "black lotus"];
    const keys = sampleNames.map((n) => normalizeScryfallCacheName(n));
    const { data: cacheSamples } = await admin.from("scryfall_cache").select("name, legalities").in("name", keys);

    const rows = (cacheSamples || []) as Array<{ name: string; legalities?: Record<string, string> | null }>;
    const byKey = new Map(rows.map((r) => [r.name, r]));

    let bannedMaps: ReturnType<typeof bannedDataToMaps> | null = null;
    try {
      if (isBannedPayload(bannedRow?.value)) {
        bannedMaps = bannedDataToMaps(bannedRow.value);
      }
    } catch {
      bannedMaps = null;
    }

    const commanderBanSet = bannedMaps?.Commander
      ? new Set(Object.keys(bannedMaps.Commander).map((k) => normalizeScryfallCacheName(k)))
      : null;

    const sample_checks = sampleNames.map((label) => {
      const k = normalizeScryfallCacheName(label);
      const row = byKey.get(k);
      const leg = row?.legalities;
      const keysCount = leg && typeof leg === "object" ? Object.keys(leg).length : 0;
      const evalCmd = evaluateCardRecommendationLegality(
        { legalities: leg ?? null },
        k,
        "Commander",
        commanderBanSet
      );
      return {
        card: label,
        cache_hit: !!row,
        legality_keys: keysCount,
        commander_allowed: evalCmd.allowed,
        commander_reason: evalCmd.reason,
      };
    });

    const banned_commander_sample = isBannedPayload(bannedRow?.value)
      ? bannedRow.value.Commander.slice(0, 5)
      : [];

    return NextResponse.json({
      ok: true,
      sync_status: syncStatus,
      app_config: {
        banned_cards_updated_at: bannedRow?.updated_at ?? null,
        banned_commander_count: isBannedPayload(bannedRow?.value) ? bannedRow.value.Commander.length : null,
        banned_commander_sample,
        job_last_mtg_legality_refresh: jobRow?.value ?? null,
        job_last_mtg_legality_refresh_at: jobRow?.updated_at ?? null,
        mtg_legality_sync_status_row_at: statusRow?.updated_at ?? null,
      },
      sample_checks,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server_error";
    console.error("[admin/mtg-legality-status]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
