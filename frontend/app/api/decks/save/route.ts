import { NextRequest, NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Force Node runtime (Supabase expects Node APIs)
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

/** Read Supabase access token from sb-*-auth-token cookie.
 *  Works for both JSON and "base64-<base64(JSON)>" formats.
 */
function readAccessTokenFromCookie(): string | null {
  // cookies() type varies across Next 15; treat it as any
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
  const accessToken = readAccessTokenFromCookie();

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Auth session missing!" },
      { status: 401 }
    );
  }

  // Resolve user from JWT held in cookie
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return NextResponse.json(
      { ok: false, error: userErr?.message || "Auth session missing!" },
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

    // legacy
    deck_text: deckText,

    // structured
    data: { cards: parseDeckText(deckText) },
    meta: { deck_text: deckText, saved_at: new Date().toISOString() },
  };

  const { data: inserted, error } = await supabase
    .from("decks")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Insert failed: " + error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 200 });
}
