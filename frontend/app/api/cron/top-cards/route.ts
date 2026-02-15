import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getCommanderBySlug } from "@/lib/commanders";

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

  const { data: decks } = await admin
    .from("decks")
    .select("id, commander")
    .eq("is_public", true)
    .eq("format", "Commander");

  if (!decks || decks.length === 0) {
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
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  await admin.from("app_config").upsert(
    { key: "job:last:top-cards", value: new Date().toISOString() },
    { onConflict: "key" }
  );

  return NextResponse.json({
    ok: true,
    updated: rows.length,
  });
}
