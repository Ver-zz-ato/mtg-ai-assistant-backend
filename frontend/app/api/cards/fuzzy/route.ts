import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";
import {
  costAuditRequestId,
  costAuditSafeErr,
  isCostAuditStorageEnabled,
} from "@/lib/observability/cost-audit";
import { costAuditServerLog } from "@/lib/observability/cost-audit-server";

export const runtime = "nodejs";

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "'")
    .trim();
}

/** One fuzzy match with similarity score (0–1) and optional strategy tag for debugging. */
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
  let scryfallHttpCalls = 0; // declared outside try for catch logging
  try {
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 50) : [];
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
      const q0 = cleanCardName(q);
      const qn = norm(q0);
      let scored: FuzzyMatchRow[] = [];

      try {
        const { data: exactData } = await supabase
          .from("scryfall_cache")
          .select("name")
          .ilike("name", q0)
          .limit(1);

        if (exactData && exactData.length > 0) {
          scored = [{ name: exactData[0].name, score: 1, source: "cache_exact" }];
        }

        if (scored.length === 0) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: containsData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `%${escaped}%`)
            .limit(12);

          if (containsData && containsData.length > 0) {
            const sorted = containsData
              .map((r) => ({
                name: r.name,
                score: stringSimilarity(qn, norm(r.name)),
                startsWith: norm(r.name).startsWith(qn),
              }))
              .sort((a, b) => {
                if (a.startsWith && !b.startsWith) return -1;
                if (!a.startsWith && b.startsWith) return 1;
                return b.score - a.score;
              });
            scored = sorted.slice(0, 12).map((r) => ({
              name: r.name,
              score: r.score,
              source: "cache_contains",
            }));
          }
        }

        if (scored.length === 0 && q0.length >= 3) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: prefixData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `${escaped}%`)
            .limit(12);

          if (prefixData && prefixData.length > 0) {
            scored = prefixData
              .map((r) => ({
                name: r.name,
                score: stringSimilarity(qn, norm(r.name)),
                source: "cache_prefix",
              }))
              .sort((a, b) => b.score - a.score);
          }
        }

        if (scored.length === 0) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: dfcData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `${escaped} // %`)
            .limit(5);

          if (dfcData && dfcData.length > 0) {
            scored = dfcData
              .map((r) => ({
                name: r.name,
                score: stringSimilarity(qn, norm(r.name)),
                source: "cache_dfc_front",
              }))
              .sort((a, b) => b.score - a.score);
          }
        }
      } catch {
        /* continue to Scryfall */
      }

      if (scored.length === 0) {
        try {
          scryfallHttpCalls += 1;
          const r = await fetch(
            `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q0)}`,
            { cache: "no-store" }
          );
          const j: any = await r.json().catch(() => ({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          scored = arr.slice(0, 12).map((s: string) => ({
            name: String(s),
            score: stringSimilarity(qn, norm(String(s))),
            source: "scryfall_autocomplete",
          }));
          scored.sort((a, b) => b.score - a.score);
        } catch {}
      }

      if (scored.length === 0) {
        try {
          scryfallHttpCalls += 1;
          const r = await fetch(
            `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`,
            { cache: "no-store" }
          );
          const j: any = await r.json().catch(() => ({}));
          const n = String(j?.name || "").trim();
          if (n) {
            scored = [
              {
                name: n,
                score: stringSimilarity(qn, norm(n)),
                source: "scryfall_named_fuzzy",
              },
            ];
          }
        } catch {}
      }

      if (scored.length === 0 && q0.includes(" ")) {
        const words = q0.split(/\s+/);
        const firstWords = words.slice(0, Math.min(2, words.length)).join(" ");
        try {
          scryfallHttpCalls += 1;
          const r = await fetch(
            `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(firstWords)}`,
            { cache: "no-store" }
          );
          const j: any = await r.json().catch(() => ({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          const filtered = arr.filter((s: string) => stringSimilarity(q0, s) > 0.3);
          scored = filtered.slice(0, 12).map((s: string) => ({
            name: String(s),
            score: stringSimilarity(qn, norm(String(s))),
            source: "scryfall_autocomplete_words",
          }));
          scored.sort((a, b) => b.score - a.score);
        } catch {}
      }

      if (scored.length === 0) {
        const firstWord = q0.split(/\s+/)[0];
        if (firstWord && firstWord.length >= 3) {
          try {
            scryfallHttpCalls += 1;
            const r = await fetch(
              `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(firstWord)}`,
              { cache: "no-store" }
            );
            const j: any = await r.json().catch(() => ({}));
            const arr = Array.isArray(j?.data) ? j.data : [];
            const filtered = arr.filter((s: string) => stringSimilarity(q0, s) > 0.25);
            scored = filtered.slice(0, 12).map((s: string) => ({
              name: String(s),
              score: stringSimilarity(qn, norm(String(s))),
              source: "scryfall_autocomplete_first_word",
            }));
            scored.sort((a, b) => b.score - a.score);
          } catch {}
        }
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
