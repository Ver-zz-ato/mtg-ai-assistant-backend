import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";           // avoid Edge runtime issues
export const dynamic = "force-dynamic";    // never prerender / cache

function withCORS(res: NextResponse, req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCORS(new NextResponse(null, { status: 204 }), req);
}

export async function POST(req: NextRequest) {
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return withCORS(
      NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }),
      req
    );
  }

  // Accept both camelCase and snake_case
  const collection_id: string | null =
    raw.collection_id ?? raw.collectionId ?? null;
  const deck_id: string | null = raw.deck_id ?? raw.deckId ?? null;
  const deck_text: string | null = raw.deck_text ?? raw.deckText ?? null;
  const currency: string = raw.currency ?? "USD";
  const use_owned: boolean = !!(raw.use_owned ?? raw.useOwned ?? true);

  // Must have either a deck_id or free-text decklist, and (for owned math) a collection_id
  if (!collection_id && !deck_text && !deck_id) {
    return withCORS(
      NextResponse.json(
        { ok: false, error: "Missing 'collection_id' or 'deck_text' or 'deck_id'" },
        { status: 400 }
      ),
      req
    );
  }

  // Build the payload the legacy endpoint expects (snake_case),
  // include both booleans to be maximally compatible.
  const normalized = {
    collection_id,
    deck_id,
    deck_text,
    currency,
    use_owned,
    useOwned: use_owned,
  };

  // Proxy to the existing, working handler
  const target = new URL("/api/collections/cost", req.nextUrl.origin);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalized),
      // No need to forward cookies for this compute call;
      // add credentials: 'include' if your legacy handler needs them.
    });
  } catch {
    return withCORS(
      NextResponse.json({ ok: false, error: "Upstream call failed" }, { status: 502 }),
      req
    );
  }

  // Pipe-through the upstream result
  const bodyText = await upstream.text();
  const res = new NextResponse(bodyText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });

  return withCORS(res, req);
}
