// Force Node runtime (supabase & libs need Node APIs; avoids Edge errors)
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * Proxies to the Python backend and normalizes the shape so the UI always gets:
 * {
 *   ok: boolean,
 *   currency: string,
 *   usedOwned: boolean,
 *   total: number,
 *   rows: Array<{ card: string; need: number; unit: number; subtotal: number }>
 * }
 */

type RawRow = {
  card?: string;
  name?: string;
  card_name?: string;

  need?: number | string;
  qty?: number | string;
  quantity?: number | string;

  unit?: number | string;
  price?: number | string;

  subtotal?: number | string;
  total?: number | string;
  sum?: number | string;
};

function toNum(v: unknown, fallback = 0): number {
  const n =
    typeof v === "string"
      ? Number(v)
      : typeof v === "number"
      ? v
      : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRows(anyRows: unknown): Array<{
  card: string;
  need: number;
  unit: number;
  subtotal: number;
}> {
  const rows: RawRow[] = Array.isArray(anyRows) ? (anyRows as RawRow[]) : [];
  return rows
    .map((r) => {
      const card = String(r.card ?? r.name ?? r.card_name ?? "");
      const need = toNum(r.need ?? r.qty ?? r.quantity, 0);
      const unit = toNum(r.unit ?? r.price, 0);
      const subtotal = toNum(r.subtotal ?? r.total ?? r.sum, need * unit);
      return { card, need, unit, subtotal };
    })
    .filter((r) => r.card.length > 0);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    // Accept both camelCase and snake_case
    const payload = {
      deckId: body.deckId ?? body.deck_id ?? undefined,
      collectionId: body.collectionId ?? body.collection_id ?? undefined,
      deckText: body.deckText ?? body.deck_text ?? undefined,
      currency: body.currency ?? "USD",
      useOwned: Boolean(body.useOwned ?? body.use_owned ?? false),
    };

    // Where is the Python backend?
    const base =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_ORIGIN ||
      process.env.BACKEND_URL ||
      "";

    if (!base) {
      return NextResponse.json(
        { ok: false, error: "BACKEND URL env not set" },
        { status: 500 }
      );
    }

    const url = base.endsWith("/") ? `${base}api/cost` : `${base}/api/cost`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { ok: false, error: `Upstream ${upstream.status}: ${text}` },
        { status: 502 }
      );
    }

    const raw = (await upstream.json().catch(() => ({}))) as Record<
      string,
      any
    >;

    // Normalize response
    const currency = raw.currency ?? payload.currency ?? "USD";
    const usedOwned = Boolean(
      raw.usedOwned ?? raw.useOwned ?? payload.useOwned ?? false
    );
    const rows = normalizeRows(raw.rows ?? raw.items ?? raw.lines);
    const total =
      typeof raw.total === "number"
        ? raw.total
        : rows.reduce((s, r) => s + r.subtotal, 0);

    return NextResponse.json({
      ok: raw.ok !== false,
      currency,
      usedOwned,
      total,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "proxy failed" },
      { status: 500 }
    );
  }
}
