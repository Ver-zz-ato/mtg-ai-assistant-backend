export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { convert } from "@/lib/currency/rates";
import { COST_TO_FINISH_FREE, COST_TO_FINISH_PRO } from "@/lib/feature-limits";

type RawRow = {
  card?: string; name?: string; card_name?: string; cardName?: string; title?: string;
  need?: number | string; qty?: number | string; quantity?: number | string; needed?: number | string; count?: number | string;
  unit?: number | string; price?: number | string; unit_price?: number | string; unitCost?: number | string;
  subtotal?: number | string; total?: number | string; sum?: number | string; line_total?: number | string; lineTotal?: number | string; extended?: number | string;
  source?: string; src?: string; price_source?: string;
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
      const source = (r.source ?? r.src ?? r.price_source ?? "Scryfall") as string;
      return { card, need, unit, subtotal, source };
    })
    .filter((r) => r.card.length > 0);
}

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    const dailyCap = isPro ? COST_TO_FINISH_PRO : COST_TO_FINISH_FREE;
    const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
    const { hashString } = await import("@/lib/guest-tracking");
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, "/api/collections/cost-to-finish", dailyCap, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: !isPro,
        error: isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${COST_TO_FINISH_FREE} free Cost to Finish runs today. Upgrade to Pro for more!`,
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }

    const payload = {
      deckId: body.deckId ?? body.deck_id ?? undefined,
      collectionId: body.collectionId ?? body.collection_id ?? undefined,
      deckText: body.deckText ?? body.deck_text ?? undefined,
      currency: body.currency ?? "USD",
      useOwned: Boolean(body.useOwned ?? body.use_owned ?? false),
      useSnapshot: Boolean(body.useSnapshot ?? body.use_snapshot ?? false),
      snapshotDate: body.snapshotDate ?? body.snapshot_date ?? undefined,
    };

    const base =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_ORIGIN ||
      process.env.BACKEND_URL ||
      "";

    const trim = (s: string) => s.replace(/\/+$/, "");
    const full = process.env.NEXT_PUBLIC_BACKEND_COST_URL || ""; // if set, use it as the exact URL

    // Prefer local endpoint first to guarantee consistent currency handling in dev
    const local = new URL("/api/collections/cost", req.url).toString();
    const candidates = full
      ? [full, local]
      : base
      ? [
          local,
          `${trim(base)}/api/cost`,
          `${trim(base)}/api/collections/cost`,
          `${trim(base)}/cost-to-finish`,
        ]
      : [local];

    let upstreamResp: Response | null = null;
    let lastText = "";
    // Forward cookies to preserve auth when proxying to same-origin endpoints (important in production)
    const fwdCookie = (()=>{ try { return (new Headers(req.headers)).get('cookie') || ''; } catch { return ''; } })();
    for (const url of candidates) {
      const r = await fetch(url, {
        method: "POST",
        // Forward cookies so downstream can read user session via Supabase
        headers: { "content-type": "application/json", ...(fwdCookie ? { cookie: fwdCookie } : {}) },
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

    const upstreamCurrency = String(raw.currency || payload.currency || "USD").toUpperCase();
    const wantCurrency = String(payload.currency || upstreamCurrency || "USD").toUpperCase();
    const usedOwned = Boolean(raw.usedOwned ?? raw.useOwned ?? payload.useOwned ?? false);
    let rows = normalizeRows(raw.rows ?? raw.items ?? raw.lines);

    // If upstream returned a different currency, convert unit/subtotal/total
    if (upstreamCurrency !== wantCurrency && ["USD","EUR","GBP"].includes(upstreamCurrency) && ["USD","EUR","GBP"].includes(wantCurrency)) {
      const converted = [] as typeof rows;
      for (const r of rows) {
        const unit = await convert(r.unit, upstreamCurrency as any, wantCurrency as any);
        const subtotal = await convert(r.subtotal, upstreamCurrency as any, wantCurrency as any);
        converted.push({ ...r, unit, subtotal });
      }
      rows = converted;
    }

    const total =
      typeof raw.total === "number"
        ? (upstreamCurrency !== wantCurrency && ["USD","EUR","GBP"].includes(upstreamCurrency) && ["USD","EUR","GBP"].includes(wantCurrency)
            ? await convert(raw.total, upstreamCurrency as any, wantCurrency as any)
            : raw.total)
        : rows.reduce((s, r) => s + r.subtotal, 0);

    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("cost_computed", { currency: wantCurrency, total, usedOwned, rows: rows.length, ms: Date.now() - t0 }); } catch {}

    const res = NextResponse.json({
      ok: raw.ok !== false,
      currency: wantCurrency,
      usedOwned,
      total,
      rows,
      prices_updated_at: raw.prices_updated_at || new Date().toISOString(),
    });
    res.headers.set('x-debug-currency', JSON.stringify({ upstream: upstreamCurrency, want: wantCurrency }));
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "proxy failed" },
      { status: 500 }
    );
  }
}
