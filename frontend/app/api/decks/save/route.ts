import { NextRequest, NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CardRow = { name: string; qty: number };

function parseDeckText(text?: string | null): CardRow[] {
  if (!text) return [];
  const out: CardRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) out.push({ qty: Number(m[1]), name: m[2] });
    else out.push({ qty: 1, name: line });
  }
  return out;
}

function readAccessTokenFromCookie(): string | null {
  const jar: any = (cookieStore as any)();
  const all = typeof jar?.getAll === "function" ? jar.getAll() : [];
  const authCookie = all.find((c: any) => String(c?.name).endsWith("-auth-token"));
  if (!authCookie?.value) return null;

  let raw: string = String(authCookie.value);
  try {
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    }
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // --- auth
  const accessToken = readAccessTokenFromCookie();
  if (!accessToken) {
    console.error("[DECKS/SAVE] no access token cookie");
    return NextResponse.json({ ok: false, error: "Auth session missing!" }, { status: 401 });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    console.error("[DECKS/SAVE] getUser failed:", userErr);
    return NextResponse.json(
      { ok: false, error: userErr?.message || "Auth session missing!" },
      { status: 401 }
    );
  }
  const user = userData.user;

  // --- body
  let body: any;
  try {
    body = await req.json();
  } catch {
    console.error("[DECKS/SAVE] invalid JSON body");
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { title, deckText, format, plan, colors, currency, is_public, commander } = body || {};
  if (!deckText) {
    console.error("[DECKS/SAVE] deck_text missing");
    return NextResponse.json({ ok: false, error: "deck_text is required" }, { status: 400 });
  }

  const row = {
    user_id: user.id,
    title: title || "Untitled deck",
    format: format || "Commander",
    plan: plan ?? null,
    colors: (colors ?? []) as string[],
    currency: (currency || "USD") as string,
    is_public: Boolean(is_public),
    commander: commander ?? null,
    deck_text: deckText,
    data: { cards: parseDeckText(deckText) },
    meta: { deck_text: deckText, saved_at: new Date().toISOString() },
  };

  console.log("[DECKS/SAVE] inserting row outline:", {
    user_id: row.user_id,
    title: row.title,
    format: row.format,
    is_public: row.is_public,
    commander: row.commander,
    has_text: !!row.deck_text,
    cards_count: row.data.cards.length,
  });

  const { data: inserted, error } = await supabase
    .from("decks")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[DECKS/SAVE] insert error:", error);
    return NextResponse.json({ ok: false, error: "Insert failed: " + error.message }, { status: 400 });
  }

  console.log("[DECKS/SAVE] success id:", inserted?.id);
  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 200 });
}
