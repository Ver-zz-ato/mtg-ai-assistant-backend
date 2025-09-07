import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
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
      currency?: string | null; // same key
      deck_text?: string | null;
      deck_id?: string | null;
      use_owned?: boolean | null;
    };

function getBackendUrl() {
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    "";
  return url.replace(/\/+$/, ""); // strip trailing slash
}

function toSnake<T extends Record<string, any>>(o: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    const snake = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, "");
    out[snake] = v;
  }
  return out;
}

async function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return await Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Upstream timeout after ${ms}ms`)), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  const BACKEND = getBackendUrl();
  if (!BACKEND) {
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

  // Accept both shapes
  const collectionId =
    ("collectionId" in body ? body.collectionId : undefined) ??
    ("collection_id" in body ? body.collection_id : undefined) ??
    null;

  const currencyRaw = (body as any).currency;
  const currency: string =
    typeof currencyRaw === "string" && currencyRaw.trim() ? currencyRaw : "USD";

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

  const payload = toSnake({
    collectionId,
    currency,
    deckText,
    deckId,
    useOwned,
  });

  // Try a small set of likely backend paths
  const candidates = [
    "/api/collections/cost",
    "/api/collections/cost-to-finish",
    "/api/cost-to-finish",
    "/collections/cost",
    "/collections/cost-to-finish",
    "/cost-to-finish",
  ];

  let lastText = "";
  for (const path of candidates) {
    try {
      const res = await withTimeout(
        fetch(`${BACKEND}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        15000,
      );

      const txt = await res.text();
      lastText = txt;

      // If pure 404, keep trying next candidate
      if (res.status === 404) continue;

      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: txt || `Upstream ${res.status}` },
          { status: res.status },
        );
      }

      // Try to parse JSON; if not JSON, return a helpful error
      try {
        const json = txt ? JSON.parse(txt) : {};
        return NextResponse.json(json);
      } catch {
        return NextResponse.json(
          { ok: false, error: "Invalid JSON from upstream" },
          { status: 502 },
        );
      }
    } catch (e: any) {
      lastText = e?.message || String(e);
      // keep trying the next candidate
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "No matching backend endpoint found (tried: " +
        candidates.join(", ") +
        "). Last error: " +
        lastText,
    },
    { status: 502 },
  );
}

export function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "POST only. Send { collectionId, currency, deckText, useOwned, deckId? } to this route.",
    },
    { status: 405 },
  );
}
