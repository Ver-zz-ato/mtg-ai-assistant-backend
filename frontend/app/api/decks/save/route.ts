// app/api/decks/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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

/**
 * Read and decode the sb-* auth cookie that looks like:  base64-<base64json>
 * Returns a JWT access token if present; otherwise null.
 */
function readAccessTokenFromCookie(): { token: string | null; rawPreview: string } {
  const jar = cookies();
  const authCookie = jar.getAll().find((c) => c.name.endsWith("-auth-token"));
  if (!authCookie?.value) return { token: null, rawPreview: "" };

  let raw = authCookie.value;
  // Newer helpers prefix with "base64-"
  if (raw.startsWith("base64-")) raw = raw.slice("base64-".length);

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    // shape: { currentSession: { access_token }, ... } OR { access_token }
    const token =
      parsed?.currentSession?.access_token ??
      parsed?.access_token ??
      null;
    return { token, rawPreview: authCookie.value.slice(0, 16) };
  } catch {
    return { token: null, rawPreview: authCookie.value.slice(0, 16) };
  }
}

export async function POST(req: NextRequest) {
  const { token, rawPreview } = readAccessTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Auth session missing (no sb-*-auth-token cookie)" },
      { status: 401 }
    );
  }

  // Create a supabase server client that forwards the end-user JWT
  const supabase = createClient({ accessToken: token });

  // Resolve the user (this also validates the token)
  const {
    data: { user },
    error: getUserErr,
  } = await supabase.auth.getUser();
  if (getUserErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Could not resolve user from token" },
      { status: 401 }
    );
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { title, deckText, format, plan, colors, currency, is_public, commander } = body;
  const cards = parseDeckText(deckText);
  const row = {
    user_id: user.id,
    title: (title || "Untitled deck") as string,
    format: (format || "Commander") as string,
    is_public: Boolean(is_public),
    commander: commander ?? null,

    // keep existing columns you already have
    deck_text: deckText ?? "",
    plan: plan ?? null,
    colors: (colors ?? []) as string[],
    currency: (currency || "USD") as string,

    // nice-to-have JSON mirrors
    data: { cards },
    meta: {
      deck_text: deckText ?? "",
      saved_at: new Date().toISOString(),
    },
  };

  // Helpful server-side breadcrumb
  console.log("[DECKS/SAVE] inserting row outline:", {
    user_id: row.user_id,
    title: row.title,
    format: row.format,
    is_public: row.is_public,
    commander: row.commander ?? null,
    has_text: !!deckText,
    cards_count: cards.length,
  });

  // ⚠️ IMPORTANT: do NOT use .single() here; just read the first element if present.
  const { data, error } = await supabase.from("decks").insert(row).select("id");

  if (error) {
    console.log("[DECKS/SAVE] done err:", error.message);
    return NextResponse.json(
      { ok: false, error: `Insert failed: ${error.message}` },
      { status: 400 }
    );
  }

  const id = Array.isArray(data) && data.length > 0 ? (data[0] as any).id : null;
  console.log("[DECKS/SAVE] done ok:", { id, cookiePreview: rawPreview });

  return NextResponse.json({ ok: true, id }, { status: 200 });
}
