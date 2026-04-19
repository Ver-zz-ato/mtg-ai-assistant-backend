import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getFirst50CommanderSlugs, getCommanderBySlug } from "@/lib/commanders";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";

const JOB_ID = "commander-aggregates";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for 50 commanders

export interface CommanderAggregate {
  topCards: Array<{ cardName: string; count: number; percent: number }>;
  deckCount: number;
  recentDecks: Array<{ id: string; title: string; updated_at: string }>;
  medianDeckCost: number | null;
}

async function computeAggregatesForCommander(
  admin: ReturnType<typeof getAdmin>,
  commanderName: string,
  slug: string
): Promise<CommanderAggregate> {
  // Match "The Ur-Dragon" and "The Ur-Dragon - Dragon Tribal" etc.
  const { data: decks, error: decksError } = await admin!
    .from("decks")
    .select("id, title, updated_at")
    .eq("is_public", true)
    .eq("format", "Commander")
    .ilike("commander", `${commanderName}%`)
    .limit(500);

  if (decksError || !decks || decks.length === 0) {
    return { topCards: [], deckCount: 0, recentDecks: [], medianDeckCost: null };
  }

  const deckIds = decks.map((d) => d.id);
  const deckCount = decks.length;

  // Top cards from deck_cards
  const { data: cards, error: cardsError } = await admin!
    .from("deck_cards")
    .select("name")
    .in("deck_id", deckIds);

  const cardCounts: Record<string, number> = {};
  if (!cardsError && cards && cards.length > 0) {
    cards.forEach((c: { name?: string }) => {
      const name = String(c.name || "").trim();
      if (name) cardCounts[name] = (cardCounts[name] || 0) + 1;
    });
  }

  const totalDecks = deckCount;
  const topCards = Object.entries(cardCounts)
    .map(([cardName, count]) => ({
      cardName,
      count,
      percent: totalDecks > 0 ? Math.round((count / totalDecks) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // 6 most recent decks
  const sorted = [...decks].sort(
    (a, b) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
  );
  const recentDecks = sorted.slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title || "Untitled Deck",
    updated_at: d.updated_at || new Date().toISOString(),
  }));

  let medianDeckCost: number | null = null;
  const { data: costs } = await admin!
    .from("deck_costs")
    .select("total_usd")
    .in("deck_id", deckIds);
  if (costs && costs.length > 0) {
    const values = (costs as { total_usd: number }[])
      .map((r) => Number(r.total_usd))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);
    if (values.length > 0) {
      const mid = Math.floor(values.length / 2);
      medianDeckCost =
        values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }
  }

  return { topCards, deckCount, recentDecks, medianDeckCost };
}

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key") || "";
  return !!cronKey && (!!vercelId || hdr === cronKey || queryKey === cronKey);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runAggregates();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runAggregates();
}

async function runAggregates() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, JOB_ID);

  try {
    const slugs = getFirst50CommanderSlugs();
    let updated = 0;
    let failed = 0;
    const failedSlugs: string[] = [];

    for (const slug of slugs) {
      const profile = getCommanderBySlug(slug);
      if (!profile) continue;

      try {
        const agg = await computeAggregatesForCommander(admin, profile.name, slug);
        const { error } = await admin
          .from("commander_aggregates")
          .upsert(
            {
              commander_slug: slug,
              top_cards: agg.topCards,
              deck_count: agg.deckCount,
              recent_decks: agg.recentDecks,
              median_deck_cost: agg.medianDeckCost,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "commander_slug" }
          );

        if (!error) updated++;
        else {
          failed++;
          if (failedSlugs.length < 8) failedSlugs.push(slug);
        }
      } catch (e) {
        console.error(`[commander-aggregates] Failed for ${slug}:`, e);
        failed++;
        if (failedSlugs.length < 8) failedSlugs.push(slug);
      }
    }

    let snapshotOk = true;
    try {
      const { snapshotCommanderAggregates } = await import("@/lib/data-moat/snapshot-commander-aggregates");
      await snapshotCommanderAggregates();
    } catch (e) {
      snapshotOk = false;
      console.error(`[commander-aggregates] History snapshot failed:`, e);
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(attemptStartedAt).getTime();
    const warnings: string[] = [];
    if (!snapshotOk) warnings.push("Daily history snapshot (data-moat) failed — check logs");
    if (failed > 0) warnings.push(`${failed} commander upsert(s) failed`);

    const lowData = updated < slugs.length;
    const detail: AdminJobDetail = {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: failed > 0 || !snapshotOk ? "partial" : "success",
      compactLine: `Refreshed ${updated}/${slugs.length} commander_aggregates rows${failed ? ` · ${failed} failed` : ""}${!snapshotOk ? " · snapshot failed" : ""}`,
      destination: "commander_aggregates",
      source: "decks → deck_cards → deck_costs (median)",
      durationMs,
      counts: {
        commanders_upserted: updated,
        commanders_targeted: slugs.length,
        upsert_failures: failed,
      },
      warnings: warnings.length ? warnings : undefined,
      labels: {
        schedule: "Daily 05:00 UTC",
        depends_on: "deck-costs for median deck cost",
      },
      extra: {
        failed_slugs_sample: failedSlugs,
        snapshot_history_ok: snapshotOk,
      },
    };
    await persistAdminJobRun(admin, JOB_ID, detail);

    return NextResponse.json({
      ok: true,
      updated,
      total: slugs.length,
      failed,
      snapshot_history_ok: snapshotOk,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const finishedAt = new Date().toISOString();
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: false,
      runResult: "failed",
      compactLine: `Failed: ${msg.slice(0, 200)}`,
      destination: "commander_aggregates",
      lastError: msg,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
