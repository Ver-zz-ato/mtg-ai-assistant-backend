// frontend/app/api/collections/cost-to-finish/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // avoid Edge, we use Node APIs here
export const dynamic = "force-dynamic";

type IncomingBody =
  | {
      // camelCase (new)
      collectionId?: string | null;
      currency?: string | null;
      deckText?: string | null;
      deckId?: string | null;
      useOwned?: boolean | null;
    }
  | {
      // snake_case (legacy)
      collection_id?: string | null;
      currency?: string | null;
      deck_text?: string | null;
      deck_id?: string | null;
      use_owned?: boolean | null;
    };

function getBackendUrl() {
  // Prefer explicit public env (used by client too), fall back to private one
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.BACKEND_URL?.trim();

  return url || "";
}

function snake<T extends Record<string, any>>(o: T) {
  // minimal mapper camelCase -> snake_case
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    const snakeKey = k
      .replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
      .replace(/^_/, "");
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
          "BACKEND_ORIGIN/NEXT_PUBLIC_BACKEND_URL not set on frontend. Set it to your backend base URL (e.g. https://mtg-ai-assistant-backend-1.onrender.com).",
      },
      { status: 500 },
    );
  }

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Accept both shapes (camelCase and snake_case)
  const collectionId =
    ("collectionId" in body ? body.collectionId : undefined) ??
    ("collection_id" in body ? body.collection_id : undefined) ??
    null;

  const currency =
    ("currency" in body ? body.currency : undefined) ??
    (("currency" in body) as any) ??
    "USD";

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

  // Minimal validation before forwarding
  if (!collectionId) {
    return NextResponse.json(
      { ok: false, error: "Missing 'collectionId'/'collection_id'." },
      { status: 400 },
    );
  }

  if (!deckText?.trim()) {
    // We require deck_text because upstream expects it (your earlier 400 proved it).
    // We still forward deck_id if present, but without deck_text upstream will reject.
    return NextResponse.json(
      { ok: false, error: "Missing 'deckText'/'deck_text' (paste your list)." },
      { status: 400 },
    );
  }

  const payloadForBackend = snake({
    collectionId,
    currency: currency || "USD",
    deckText,
    // Optional extras (harmless if upstream ignores them)
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
      // Bubble exact upstream error so we can see what's wrong
      return NextResponse.json(
        { ok: false, error: text || `Upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }

    // Try to parse JSON; if not JSON, wrap it
    try {
      const json = text ? JSON.parse(text) : {};
      return NextResponse.json(json);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON from upstream" },
        { status: 502 },
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Upstream call failed" },
      { status: 502 },
    );
  }
}

export function GET() {
  // Helpful hint if someone GETs the route
  return NextResponse.json(
    {
      ok: false,
      error:
        "POST only. Send { collectionId, currency, deckText, useOwned, deckId? }.",
    },
    { status: 405 },
  );
}
