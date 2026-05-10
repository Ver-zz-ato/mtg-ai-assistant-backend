import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findCardNameMatches } from "@/lib/server/cardNameResolution";
import {
  costAuditRequestId,
  costAuditSafeErr,
  isCostAuditStorageEnabled,
} from "@/lib/observability/cost-audit";
import { costAuditServerLog } from "@/lib/observability/cost-audit-server";

export const runtime = "nodejs";

/** One fuzzy match with similarity score (0-1) and optional strategy tag for debugging. */
export type FuzzyMatchRow = {
  name: string;
  score: number;
  source?: string;
};

function dedupeBestByName(rows: FuzzyMatchRow[]): FuzzyMatchRow[] {
  const byLower = new Map<string, FuzzyMatchRow>();
  for (const row of rows) {
    const k = row.name.toLowerCase();
    const prev = byLower.get(k);
    if (!prev || row.score > prev.score) {
      byLower.set(k, row);
    }
  }
  return [...byLower.values()].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const reqId = isCostAuditStorageEnabled() ? costAuditRequestId() : "";
  let scryfallHttpCalls = 0;
  try {
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 100) : [];
    if (!names.length) {
      if (isCostAuditStorageEnabled()) {
        costAuditServerLog({
          route: "/api/cards/fuzzy",
          method: "POST",
          reqId,
          event: "fuzzy.request",
          durationMs: Date.now() - t0,
          ok: false,
          err: "names required",
          namesCount: 0,
        });
      }
      return NextResponse.json({ ok: false, error: "names required" }, { status: 400 });
    }

    const supabase = await createClient();
    const results: Record<
      string,
      {
        suggestion?: string;
        /** @deprecated Prefer `matches`; kept for older clients. */
        all?: string[];
        matches: FuzzyMatchRow[];
      }
    > = {};

    for (const raw of names) {
      const q = String(raw || "").trim();
      let scored: FuzzyMatchRow[] = [];

      try {
        scored = await findCardNameMatches(supabase, q, 12);
        if (scored.some((match) => match.source?.startsWith("scryfall_"))) {
          scryfallHttpCalls += 1;
        }
      } catch {
        scored = [];
      }

      scored = dedupeBestByName(scored);
      const suggestion = scored[0]?.name;
      const all = scored.map((m) => m.name);
      results[q] = { suggestion, all, matches: scored };
    }

    if (isCostAuditStorageEnabled()) {
      costAuditServerLog({
        route: "/api/cards/fuzzy",
        method: "POST",
        reqId,
        event: "fuzzy.request",
        durationMs: Date.now() - t0,
        ok: true,
        namesCount: names.length,
        scryfallHttpCalls,
        externalLookup: scryfallHttpCalls > 0,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    if (isCostAuditStorageEnabled()) {
      costAuditServerLog({
        route: "/api/cards/fuzzy",
        method: "POST",
        reqId,
        event: "fuzzy.request",
        durationMs: Date.now() - t0,
        ok: false,
        err: costAuditSafeErr(e),
        scryfallHttpCalls,
      });
    }
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
