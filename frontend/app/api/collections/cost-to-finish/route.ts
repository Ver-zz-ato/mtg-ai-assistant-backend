import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // use Node runtime (not Edge)
export const dynamic = "force-dynamic";

type IncomingBody =
  | {
      collectionId?: string | null;
      currency?: string | null;
      deckText?: string | null;
      deckId?: string | null;
      useOwned?: boolean | null;
    }
  | {
      collection_id?: string | null;
      currency?: string | null; // same key in legacy shape
      deck_text?: string | null;
      deck_id?: string | null;
      use_owned?: boolean | null;
    };

function getBackendUrl() {
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.BACKEND_URL?.trim();
  return url || "";
}

function snake<T extends Record<string, any>>(o: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    const snakeKey = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, "");
    out[snakeKey] = v;
  }
  return out;
}

async function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return await Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`Upstream timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export async function POST(req: NextRequest) {
  const BACKEND_URL = getBackendUrl();
  if (!BACKEND_URL) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "BACKEND_ORIGIN/NEXT_PUBLIC_BACKEND_URL not set on frontend. Set it to your backend base URL (e.g. https://mtg-ai-assistant-backend.onrender.com).",
      },
      { status: 500 },
    );
  }

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept camelCase and snake_case
  const collectionId =
    ("collectionId" in body ? body.collectionId : undefined) ??
    ("collection_id" in body ? body.collection_id : undefined) ??
    null;

  // currency uses the same key in both shapes; keep it simple
  const currencyRaw = (body as any).currency;
  const currency: string = typeof currencyRaw === "string" && currencyRaw ? currencyRaw : "USD";

  const deckText =
    ("deckText" in body ? body.deckText : undefined) ??
    ("deck_text" in body ? body.deck_text : undefined) ??
    "";

  const deckId =
    ("deckId" in body ? body.deckId : undefined) ??
    ("deck_id" in body ? body.deck_id : undefined) ??
    null;

  const useOwned =
    ("useOwned" in body ? body.useOwned : undefined) ??
    ("use_owned" in body ? body.use_owned : undefined) ??
    true;

  if (!collectionId) {
    return NextResponse.json(
      { ok: false, error: "Missing 'collectionId'/'collection_id'." },
      { status: 400 },
    );
  }
  if (!deckText?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing 'deckText'/'deck_text' (paste your list)." },
      { status: 400 },
    );
  }

  const payloadForBackend = snake({
    collectionId,
    currency,
    deckText,
    deckId,
    useOwned,
  });

  try {
    const upstream = await withTimeout(
      fetch(`${BACKEND_URL}/api/collections/cost`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadForBackend),
      }),
      15000,
    );

    const text = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: text || `Upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }

    try {
      const json = text ? JSON.parse(text) : {};
      return NextResponse.json(json);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON from upstream" }, { status: 502 });
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Upstream call failed" },
      { status: 502 },
    );
  }
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "POST only. Send { collectionId, currency, deckText, useOwned, deckId? }." },
    { status: 405 },
  );
}
