// app/api/collections/cost-to-finish/route.ts
import { NextResponse } from "next/server";

// IMPORTANT: set NEXT_PUBLIC_BACKEND_URL in Render (Frontend) to
// https://mtg-ai-assistant-backend.onrender.com   (no trailing slash)
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function POST(req: Request) {
  try {
    if (!BACKEND) {
      return NextResponse.json(
        { ok: false, error: "NEXT_PUBLIC_BACKEND_URL not set" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // normalize keys the backend accepts
    const deck_text =
      body.deck_text ?? body.deckText ?? body.deck ?? body.text ?? "";
    const currency = (body.currency ?? "USD").toUpperCase();
    // Optional: map of { "Card Name": qtyOwned }
    const owned = body.owned ?? undefined;

    if (!deck_text || !deck_text.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing 'deckText'/'deck_text'" },
        { status: 400 }
      );
    }

    const resp = await fetch(`${BACKEND}/api/collections/cost`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deck_text, currency, owned }),
      // We call server→server, no CORS needed here.
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Upstream error: ${resp.status}`, detail: errText },
        { status: 502 }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Proxy error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
