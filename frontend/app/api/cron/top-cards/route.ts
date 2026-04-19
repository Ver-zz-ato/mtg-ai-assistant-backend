import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getCommanderBySlug } from "@/lib/commanders";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";

const JOB_ID = "top-cards";

export const runtime = "nodejs";
export const maxDuration = 180;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  return runTopCards();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runTopCards();
}

async function runTopCards() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, JOB_ID);

  const { data: decks } = await admin
    .from("decks")
    .select("id, commander")
    .eq("is_public", true)
    .eq("format", "Commander");

  if (!decks || decks.length === 0) {
    const finishedAt = new Date().toISOString();
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: "No public Commander decks — top_cards cleared / empty",
      destination: "top_cards",
      source: "decks → deck_cards (global top 200 cards)",
      counts: { top_card_rows: 0, public_commander_decks: 0 },
      labels: { schedule: "Daily 05:30 UTC", depends_on: "commander pages use this + commander_aggregates" },
    });
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const deckIds = decks.map((d) => d.id);
  const commanderByDeck = new Map<string, string>();
  for (const d of decks) {
    const c = (d.commander as string)?.trim();
    if (c) commanderByDeck.set(d.id, c);
  }

  const { data: cards } = await admin
    .from("deck_cards")
    .select("deck_id, name")
    .in("deck_id", deckIds);

  const cardCounts: Record<string, number> = {};
  const deckIdsByCard: Record<string, Set<string>> = {};

  for (const c of cards ?? []) {
    const name = (c.name as string)?.trim();
    if (!name) continue;
    cardCounts[name] = (cardCounts[name] ?? 0) + 1;
    if (!deckIdsByCard[name]) deckIdsByCard[name] = new Set();
    deckIdsByCard[name].add(c.deck_id as string);
  }

  const top200 = Object.entries(cardCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 200);

  const slugUsed = new Map<string, number>();
  const rows: Array<{ card_name: string; slug: string; deck_count: number; commander_slugs: string[] }> = [];

  for (const [cardName, deckCount] of top200) {
    let slug = toSlug(cardName);
    const existing = slugUsed.get(slug) ?? 0;
    slugUsed.set(slug, existing + 1);
    if (existing > 0) slug = `${slug}-${existing + 1}`;

    const deckIdsForCard = deckIdsByCard[cardName] ?? new Set();
    const commanderNames = [...new Set([...deckIdsForCard].map((id) => commanderByDeck.get(id)).filter(Boolean))] as string[];
    const commanderSlugs = commanderNames
      .map((n) => getCommanderBySlug(toSlug(n))?.slug ?? toSlug(n))
      .filter(Boolean);
    const uniqueSlugs = [...new Set(commanderSlugs)].slice(0, 20);

    rows.push({
      card_name: cardName,
      slug,
      deck_count: deckCount,
      commander_slugs: uniqueSlugs,
    });
  }

  const { error } = await admin.from("top_cards").delete().neq("card_name", "");
  if (error) console.warn("[top-cards] Clear failed:", error.message);

  if (rows.length > 0) {
    const { error: insErr } = await admin.from("top_cards").insert(
      rows.map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      }))
    );
    if (insErr) {
      const finishedAt = new Date().toISOString();
      await persistAdminJobRun(admin, JOB_ID, {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: false,
        runResult: "failed",
        compactLine: `Insert failed: ${insErr.message}`,
        destination: "top_cards",
        lastError: insErr.message,
      });
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  const commanderNames = new Set<string>();
  for (const d of decks) {
    const c = (d.commander as string)?.trim();
    if (c) commanderNames.add(c);
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(attemptStartedAt).getTime();
  const detail: AdminJobDetail = {
    jobId: JOB_ID,
    attemptStartedAt,
    finishedAt,
    ok: true,
    runResult: "success",
    compactLine: `Inserted ${rows.length} top_cards rows from ${decks.length} public decks (${commanderNames.size} commander strings)`,
    destination: "top_cards",
    source: "decks → deck_cards",
    durationMs,
    counts: {
      top_card_rows: rows.length,
      public_commander_decks: decks.length,
      distinct_commander_strings: commanderNames.size,
    },
    labels: {
      schedule: "Daily 05:30 UTC",
      scope: "Global top 200 cards + commander slug hints",
    },
  };
  await persistAdminJobRun(admin, JOB_ID, detail);

  return NextResponse.json({
    ok: true,
    updated: rows.length,
  });
}
