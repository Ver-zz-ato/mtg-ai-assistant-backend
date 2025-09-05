import { NextRequest, NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** Next 15-safe cookie reader (handles both sync and promise cookies()) */
async function getAllCookies(): Promise<Array<{ name: string; value: string }>> {
  try {
    const maybe = (cookieStore as any)();
    const jar =
      maybe && typeof maybe.then === "function" ? await maybe : maybe;
    if (jar && typeof jar.getAll === "function") {
      return jar.getAll();
    }
  } catch {
    // ignore
  }
  return [];
}

/** Extract Supabase access token from sb-*-auth-token cookie (supports base64- prefixed JSON) */
async function readAccessTokenFromCookie(): Promise<{ token: string | null; preview: string }> {
  const all = await getAllCookies();
  const authCookie = all.find((c) => c.name.endsWith("-auth-token"));
  if (!authCookie?.value) return { token: null, preview: "" };

  let raw = String(authCookie.value);
  const preview = raw.slice(0, 24);
  try {
    if (raw.startsWith("base64-")) raw = raw.slice(7);
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    const token =
      parsed?.currentSession?.access_token ??
      parsed?.access_token ??
      null;
    return { token, preview };
  } catch {
    return { token: null, preview };
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // --- auth via cookie
  const { token, preview } = await readAccessTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Auth session missing!" },
      { status: 401 }
    );
  }

  // Validate token and get user
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return NextResponse.json(
      { ok: false, error: userErr?.message || "Auth session invalid" },
      { status: 401 }
    );
  }
  const user = userData.user;

  // Body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.deckText) {
    return NextResponse.json({ ok: false, error: "deck_text is required" }, { status: 400 });
  }

  const { title, deckText, format, plan, colors, currency, is_public, commander } = body;

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
    commander: row.commander ?? null,
    has_text: !!deckText,
    cards_count: row.data.cards.length,
  });

  // NOTE: do not use .single() here; some RLS configs make it hang if row isn't selectable.
  // Also: because this client might still be "anon" for DB calls, RLS insert policy must allow auth via JWT.
  // If your createClient isn't propagating the JWT, we may switch to a per-request client later.
  const { data, error } = await supabase.from("decks").insert(row).select("id");

  if (error) {
    console.log("[DECKS/SAVE] done err:", error.message, "| cookie:", preview);
    return NextResponse.json(
      { ok: false, error: `Insert failed: ${error.message}` },
      { status: 400 }
    );
  }

  const id = Array.isArray(data) && data.length ? (data[0] as any).id : null;
  console.log("[DECKS/SAVE] done ok:", { id, cookiePreview: preview });

  return NextResponse.json({ ok: true, id }, { status: 200 });
}
