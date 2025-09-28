// app/api/decks/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { containsProfanity, sanitizeName } from "@/lib/profanity";

type SaveBody = {
  title?: string;
  deckText?: string;
  format?: string;
  plan?: string;
  colors?: string[];
  currency?: string;
  is_public?: boolean;
};

function parseDeckText(raw?: string): { name: string; qty: number }[] {
  if (!raw) return [];
  const out: Record<string, number> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    // formats: "2 Arcane Signet", "2x Arcane Signet", or "Arcane Signet" (qty=1)
    const m = t.match(/^\s*(\d+)x?\s+(.+?)\s*$/i);
    if (m) {
      const qty = Math.max(0, parseInt(m[1], 10) || 0);
      const name = m[2].trim();
      if (qty > 0 && name) out[name] = (out[name] ?? 0) + qty;
      continue;
    }
    // fallback: treat whole line as name, qty=1
    out[t] = (out[t] ?? 0) + 1;
  }
  return Object.entries(out).map(([name, qty]) => ({ name, qty }));
}

async function scryfallBatch(names: string[]): Promise<Record<string, any>> {
  const identifiers = Array.from(new Set(names.filter(Boolean))).slice(0, 300).map((n) => ({ name: n }));
  const out: Record<string, any> = {};
  if (!identifiers.length) return out;
  try {
    const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
    const j:any = await r.json().catch(()=>({}));
    const rows:any[] = Array.isArray(j?.data) ? j.data : [];
    for (const c of rows) out[String(c?.name||'').toLowerCase()] = c;
    // Upsert details into scryfall_cache (images + type_line/oracle_text)
    try {
      const supabase = await createClient();
      const up: any[] = rows.map((c:any)=>{
        const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
        return {
          name: String(c?.name||'').toLowerCase(),
          small: img.small || null,
          normal: img.normal || null,
          art_crop: img.art_crop || null,
          type_line: c?.type_line || null,
          oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
          updated_at: new Date().toISOString(),
        };
      });
      if (up.length) await supabase.from('scryfall_cache').upsert(up, { onConflict: 'name' });
    } catch {}
  } catch {}
  return out;
}

async function computeArchetype(parsed: { name: string; qty: number }[]) {
  const scry = await scryfallBatch(parsed.map(p=>p.name));
  const scores = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
  for (const { name, qty } of parsed) {
    const card = scry[String(name||'').toLowerCase()];
    const type = String(card?.type_line||'');
    const text = String(card?.oracle_text||'').toLowerCase();
    const cmc = Number(card?.cmc||0);
    const q = Math.min(Math.max(qty||1,1),4);
    if (type.includes('Creature')) { scores.aggro += 0.5*q; scores.midrange += 0.2*q; }
    if (type.includes('Instant') || type.includes('Sorcery')) { scores.control += 0.2*q; scores.combo += 0.1*q; }
    if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { scores.control += 0.6*q; }
    if (/search your library/.test(text) || /tutor/.test(text)) { scores.combo += 0.6*q; }
    if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
        || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) {
      scores.stax += 0.8*q;
    }
    if (cmc <= 2 && type.includes('Creature')) { scores.aggro += 0.2*q; }
    if (cmc >= 5 && type.includes('Creature')) { scores.midrange += 0.2*q; }
  }
  return scores;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes, error: authErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: authErr?.message ?? "Unauthenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as SaveBody;

    // Profanity guard for title
    const rawTitle = String(body.title ?? '').trim();
    const cleanTitle = sanitizeName(rawTitle, 120);
    if (cleanTitle && containsProfanity(cleanTitle)) {
      return NextResponse.json({ ok: false, error: "Please choose a different deck name." }, { status: 400 });
    }

    const is_public = body.is_public === true;
    const insertDeck = {
      user_id: user.id,
      title: cleanTitle || "Untitled Deck",
      format: body.format ?? "Commander",
      plan: body.plan ?? "Optimized",
      colors: Array.isArray(body.colors) ? body.colors : [],
      currency: body.currency ?? "USD",
      deck_text: body.deckText ?? "",
      is_public,
      public: is_public, // keep legacy flag in sync
    };

    // 1) Insert the deck
    const { data: deckRow, error: deckErr } = await supabase
      .from("decks")
      .insert(insertDeck)
      .select("id, title, is_public")
      .single();

    if (deckErr || !deckRow) {
      return NextResponse.json({ ok: false, error: deckErr?.message ?? "Insert failed" }, { status: 400 });
    }

    const deckId = deckRow.id as string;

    // 2) Parse and insert cards (best-effort; ignore RLS errors so save still succeeds)
    const parsed = parseDeckText(body.deckText);
    if (parsed.length > 0) {
      const rows = parsed.map((c) => ({
        deck_id: deckId,
        name: c.name,
        qty: c.qty,
      }));

      // bulk insert in chunks of ~300 to be safe
      const CHUNK = 300;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: cardErr } = await supabase.from("deck_cards").insert(chunk);
        if (cardErr) {
          // If RLS blocks or a duplicate triggers, we still return success with a warning
          return NextResponse.json({
            ok: true,
            id: deckId,
            warning: "Deck saved, but some cards were not inserted (RLS or constraint).",
            card_error: cardErr.message,
          }, { status: 200 });
        }
      }

      // Compute archetype scores and persist into decks.meta
      try {
        const scores = await computeArchetype(parsed);
        const { data: metaRow } = await supabase.from('decks').select('meta').eq('id', deckId).single();
        const nextMeta = { ...(metaRow?.meta || {}), archetype: scores } as any;
        await supabase.from('decks').update({ meta: nextMeta }).eq('id', deckId);
      } catch {}
    }

    return NextResponse.json({ ok: true, id: deckId }, { status: 200 });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
