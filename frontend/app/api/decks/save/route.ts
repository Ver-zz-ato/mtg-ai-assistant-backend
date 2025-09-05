import { NextRequest, NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient as createSb } from "@supabase/supabase-js";

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

// Next 15-safe cookies()
async function getAllCookies(): Promise<Array<{ name: string; value: string }>> {
  try {
    const maybe = (cookieStore as any)();
    const jar = typeof maybe?.then === "function" ? await maybe : maybe;
    if (jar && typeof jar.getAll === "function") return jar.getAll();
  } catch {}
  return [];
}

async function readAccessToken(): Promise<{ token: string | null; preview: string }> {
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

function sbWithBearer(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSb(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) =>
    (t = setTimeout(() => rej(new Error("timeout")), ms))
  );
  try {
    return (await Promise.race([p, timeout])) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "600",
    },
  });
}

export async function POST(req: NextRequest) {
  const { token, preview } = await readAccessToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Auth session missing!" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { title, deckText, format, plan, colors, currency, is_public, commander } = body || {};
  if (!deckText) {
    return NextResponse.json({ ok: false, error: "deck_text is required" }, { status: 400 });
  }

  const dataCards = parseDeckText(deckText);
  const row = {
    title: title || "Untitled deck",
    format: format || "Commander",
    plan: plan ?? null,
    colors: (colors ?? []) as string[],
    currency: (currency || "USD") as string,
    is_public: Boolean(is_public),
    commander: commander ?? null,
    deck_text: deckText,
    data: { cards: dataCards },
    meta: { deck_text: deckText, saved_at: new Date().toISOString() },
  };

  console.log("[DECKS/SAVE] inserting row outline:", {
    title: row.title,
    format: row.format,
    is_public: row.is_public,
    commander: row.commander ?? null,
    has_text: !!deckText,
    cards_count: dataCards.length,
  });

  try {
    const sb = sbWithBearer(token);

    // ⬇️ Explicitly type the Supabase response so TS is happy
    type SbResp = { data: any; error: { message: string } | null };

    const { data, error } = (await withTimeout<SbResp>(
      sb.from("decks").insert(row).select("id")
    )) as SbResp;

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
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.log("[DECKS/SAVE] crashed:", msg);
    const status = msg === "timeout" ? 504 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
