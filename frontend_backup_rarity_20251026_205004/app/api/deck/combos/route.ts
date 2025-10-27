import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectCombosSmart, normalizeDeckNames, scryfallLink } from "@/lib/combos/detect";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const deckId = String(body?.deckId || "").trim();
    let deckText = String(body?.deckText || "");

    if (!deckText && deckId) {
      const supabase = await createClient();
      const { data, error } = await supabase.from("decks").select("deck_text").eq("id", deckId).maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      deckText = String(data?.deck_text || "");
    }
    if (!deckText) return NextResponse.json({ ok: false, error: "missing deck" }, { status: 400 });

    const names = normalizeDeckNames(deckText);

    // Fetch Scryfall details for semantic category detection
    const identifiers = Array.from(new Set(names)).slice(0, 300).map(n => ({ name: n }));
    let details: Record<string, { type_line?: string; oracle_text?: string | null; name?: string }> = {};
    try {
      if (identifiers.length) {
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
        const j: any = await r.json().catch(()=>({}));
        const rows: any[] = Array.isArray(j?.data) ? j.data : [];
        for (const c of rows) {
          const key = String(c?.name||'').toLowerCase();
          const o = c?.oracle_text || c?.card_faces?.[0]?.oracle_text || null;
          details[key] = { name: c?.name, type_line: c?.type_line, oracle_text: o };
        }
      }
    } catch {}

    const { present, missing } = detectCombosSmart(names, details);

    // Attach Scryfall links for convenience
    const enrich = {
      present: present.map(p => ({ ...p, links: p.pieces.map(n => scryfallLink(n)) })),
      missing: missing.map(m => ({ ...m, links: { suggest: scryfallLink(m.suggest), all: m.missing.map(n => scryfallLink(n)) } })),
    };

    return NextResponse.json({ ok: true, ...enrich });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "combo detect failed" }, { status: 500 });
  }
}
