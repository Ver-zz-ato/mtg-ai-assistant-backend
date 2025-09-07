export const runtime = "nodejs";

import { NextResponse } from "next/server";

type RawRow = {
  card?: string; name?: string; card_name?: string; cardName?: string; title?: string;
  need?: number | string; qty?: number | string; quantity?: number | string; needed?: number | string; count?: number | string;
  unit?: number | string; price?: number | string; unit_price?: number | string; unitCost?: number | string;
  subtotal?: number | string; total?: number | string; sum?: number | string; line_total?: number | string; lineTotal?: number | string; extended?: number | string;
};

function toNum(v: unknown, fallback = 0): number {
  const n =
    typeof v === "number" ? v :
    typeof v === "string" ? Number(v) :
    NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRows(anyRows: unknown) {
  const rows: RawRow[] = Array.isArray(anyRows) ? (anyRows as RawRow[]) : [];
  return rows
    .map((r) => {
      const card = String(r.card ?? r.name ?? r.card_name ?? r.cardName ?? r.title ?? "");
      const need = toNum(r.need ?? r.qty ?? r.quantity ?? r.needed ?? r.count, 0);
      const unit = toNum(r.unit ?? r.price ?? r.unit_price ?? r.unitCost, 0);
      const subtotal = toNum(
        r.subtotal ?? r.total ?? r.sum ?? r.line_total ?? r.lineTotal ?? r.extended,
        need * unit
      );
      return { card, need, unit, subtotal };
    })
    .filter((r) => r.card.length > 0);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const payload = {
      deckId: body.deckId ?? body.deck_id ?? undefined,
      collectionId: body.collectionId ?? body.collection_id ?? undefined,
      deckText: body.deckText ?? body.deck_text ?? undefined,
      currency: body.currency ?? "USD",
      useOwned: Boolean(body.useOwned ?? body.use_owned ?? false),
    };

    const base =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_ORIGIN ||
      process.env.BACKEND_URL ||
      "";

    if (!base && !process.env.NEXT_PUBLIC_BACKEND_COST_URL) {
      return NextResponse.json(
        { ok: false, error: "BACKEND URL env not set" },
        { status: 500 }
      );
    }

    const trim = (s: string) => s.replace(/\/+$/, "");
    const full =
      process.env.NEXT_PUBLIC_BACKEND_COST_URL ||
      ""; // if set, use it as the exact URL

    const candidates = full
      ? [full]
      : base
      ? [
          `${trim(base)}/api/cost`,
          `${trim(base)}/api/collections/cost`,
          `${trim(base)}/cost-to-finish`,
        ]
      : [];

    let upstreamResp: Response | null = null;
    let lastText = "";
    for (const url of candidates) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null as any);

      if (!r) continue;

      if (r.status === 404 || r.status === 405) {
        // try next candidate
        lastText = await r.text().catch(() => "");
        continue;
      }

      upstreamResp = r;
      break;
    }

    if (!upstreamResp) {
      return NextResponse.json(
        {
          ok: false,
          error: `No matching backend endpoint found (tried: ${candidates.join(
            ", "
          )}). Last error: ${lastText || "Not Found"}`,
        },
        { status: 502 }
      );
    }

    if (!upstreamResp.ok) {
      const text = await upstreamResp.text();
      return NextResponse.json(
        { ok: false, error: `Upstream ${upstreamResp.status}: ${text}` },
        { status: 502 }
      );
    }

    const raw = (await upstreamResp.json().catch(() => ({}))) as Record<string, any>;

    const currency = raw.currency ?? payload.currency ?? "USD";
    const usedOwned = Boolean(raw.usedOwned ?? raw.useOwned ?? payload.useOwned ?? false);
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
