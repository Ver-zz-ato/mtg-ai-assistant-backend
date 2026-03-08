// app/api/collections/fuzzy-match/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";

export const dynamic = "force-dynamic";

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "'")
    .trim();
}

type MatchResult = {
  originalName: string;
  matchStatus: "exact" | "fuzzy" | "notfound";
  suggestedName?: string;
  confidence?: number;
  scryfallData?: {
    name: string;
    set?: string;
    image_uri?: string;
  };
};

/**
 * Fuzzy match card names against scryfall_cache first (accurate, fast), then Scryfall API fallback.
 * Same matching strategy as /api/cards/fuzzy and deck fix-names.
 */
export async function POST(req: Request) {
  try {
    const { names } = await req.json();

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: false, error: "names array required" }, { status: 400 });
    }

    const limitedNames = names.slice(0, 200); // Raise from 100 for larger imports
    const supabase = await createClient();

    const results: MatchResult[] = await Promise.all(
      limitedNames.map(async (rawName: string): Promise<MatchResult> => {
        const q = String(rawName || "").trim();
        const q0 = cleanCardName(q);
        const qn = norm(q0);
        let matchName: string | null = null;
        let confidence = 0;

        // 1) scryfall_cache: exact match
        if (q0.length >= 2) {
          const { data: exactData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", q0)
            .limit(1);

          if (exactData?.length) {
            matchName = exactData[0].name;
            confidence = 100;
          }
        }

        // 2) scryfall_cache: contains match (sorted by similarity)
        if (!matchName) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: containsData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `%${escaped}%`)
            .limit(15);

          if (containsData?.length) {
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

            const best = sorted[0];
            if (best && best.score >= 0.5) {
              matchName = best.name;
              confidence = Math.round(best.score * 100);
            }
          }
        }

        // 3) scryfall_cache: prefix match
        if (!matchName && q0.length >= 3) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: prefixData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `${escaped}%`)
            .limit(5);

          if (prefixData?.length) {
            const best = prefixData
              .map((r) => ({ name: r.name, score: stringSimilarity(qn, norm(r.name)) }))
              .sort((a, b) => b.score - a.score)[0];
            if (best && best.score >= 0.4) {
              matchName = best.name;
              confidence = Math.round(best.score * 100);
            }
          }
        }

        // 4) scryfall_cache: DFC front-face match
        if (!matchName && q0.length >= 3) {
          const escaped = q0.replace(/[%_]/g, "\\$&");
          const { data: dfcData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `${escaped} // %`)
            .limit(5);

          if (dfcData?.length) {
            matchName = dfcData[0].name;
            confidence = Math.round(stringSimilarity(qn, norm(dfcData[0].name)) * 100);
          }
        }

        // 5) Scryfall autocomplete fallback
        if (!matchName) {
          try {
            const r = await fetch(
              `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q0)}`,
              { cache: "no-store" }
            );
            const j = (await r.json().catch(() => ({}))) as { data?: string[] };
            const arr = Array.isArray(j?.data) ? j.data : [];
            const filtered = arr.filter((s: string) => stringSimilarity(q0, s) > 0.4);
            if (filtered.length) {
              matchName = filtered[0];
              confidence = Math.round(stringSimilarity(q0, matchName) * 100);
            }
          } catch {}
        }

        // 6) Scryfall named?fuzzy fallback
        if (!matchName) {
          try {
            const r = await fetch(
              `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`,
              { cache: "no-store" }
            );
            if (r.ok) {
              const j = (await r.json()) as { name?: string };
              const n = String(j?.name || "").trim();
              if (n) {
                matchName = n;
                confidence = Math.round(stringSimilarity(q0, n) * 100);
              }
            }
          } catch {}
        }

        if (!matchName) {
          return {
            originalName: q,
            matchStatus: "notfound",
            confidence: 0,
          };
        }

        // Fetch image + set from scryfall_cache (cache-first)
        let imageUri: string | undefined;
        let setName: string | undefined;
        const { data: imgRow } = await supabase
          .from("scryfall_cache")
          .select("small, normal, set")
          .eq("name", matchName)
          .maybeSingle();

        if (imgRow) {
          const row = imgRow as { small?: string | null; normal?: string | null; set?: string | null };
          imageUri = row.small || row.normal || undefined;
          setName = row.set ?? undefined;
        } else {
          // Cache miss: fallback to Scryfall API for image (only when cache doesn't have it)
          try {
            const r = await fetch(
              `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(matchName)}`,
              { cache: "no-store" }
            );
            if (r.ok) {
              const c = (await r.json()) as { image_uris?: { small?: string; normal?: string }; set_name?: string };
              const img = c?.image_uris || (c as any)?.card_faces?.[0]?.image_uris;
              imageUri = img?.small || img?.normal;
              setName = c?.set_name;
            }
          } catch {}
        }

        const matchStatus: "exact" | "fuzzy" = confidence >= 95 ? "exact" : "fuzzy";

        return {
          originalName: q,
          matchStatus,
          suggestedName: matchName,
          confidence,
          scryfallData: {
            name: matchName,
            set: setName,
            image_uri: imageUri,
          },
        };
      })
    );

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("collections/fuzzy-match error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "fuzzy-match error" },
      { status: 500 }
    );
  }
}
