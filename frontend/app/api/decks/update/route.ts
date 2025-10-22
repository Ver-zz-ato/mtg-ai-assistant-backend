import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  id: string;
  title?: string | null;
  deck_text?: string | null;
  is_public?: boolean | null;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const b = (await req.json()) as Body | null;
    if (!b?.id) {
      return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
    }

    // Build a partial update object
    const update: Record<string, unknown> = {};
    if (typeof b.title === "string") {
      const { containsProfanity, sanitizeName } = await import("@/lib/profanity");
      const next = sanitizeName(b.title, 120);
      if (containsProfanity(next)) {
        return NextResponse.json({ error: "Please choose a different deck name" }, { status: 400 });
      }
      update.title = next || "Untitled Deck";
    }
    if (typeof b.deck_text === "string") update.deck_text = b.deck_text;
    if (typeof b.is_public === "boolean") update.is_public = b.is_public;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // RLS protects to owner; filter by id (and optionally user_id for belt & braces)
    const { data, error } = await supabase
      .from("decks")
      .update(update)
      .eq("id", b.id)
      .eq("user_id", user.id)
      .select("id, deck_text, meta")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If deck_text changed, recompute archetype scores and persist in meta
    try {
      if (typeof b.deck_text === 'string') {
        const parsed = (b.deck_text || '').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(t=>{
          const m = t.match(/^(\d+)x?\s+(.+)$/i); if (m) return { qty: parseInt(m[1],10)||1, name: m[2] };
          return { qty: 1, name: t };
        });
        const scores = await (async function(){
          const identifiers = Array.from(new Set(parsed.map(p=>p.name))).slice(0,300).map(n=>({ name: n }));
          const scry: Record<string, any> = {};
          if (identifiers.length) {
            const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
            const j:any = await r.json().catch(()=>({}));
            const rows:any[] = Array.isArray(j?.data) ? j.data : [];
            for (const c of rows) scry[String(c?.name||'').toLowerCase()] = c;
            // cache details
            try {
              const up = rows.map((c:any)=>{
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
          }
          const out = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
          for (const { name, qty } of parsed) {
            const card = scry[String(name||'').toLowerCase()];
            const type = String(card?.type_line||'');
            const text = String(card?.oracle_text||'').toLowerCase();
            const cmc = Number(card?.cmc||0);
            const q = Math.min(Math.max(qty||1,1),4);
            if (type.includes('Creature')) { out.aggro += 0.5*q; out.midrange += 0.2*q; }
            if (type.includes('Instant') || type.includes('Sorcery')) { out.control += 0.2*q; out.combo += 0.1*q; }
            if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { out.control += 0.6*q; }
            if (/search your library/.test(text) || /tutor/.test(text)) { out.combo += 0.6*q; }
            if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
               || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) {
              out.stax += 0.8*q;
            }
            if (cmc <= 2 && type.includes('Creature')) { out.aggro += 0.2*q; }
            if (cmc >= 5 && type.includes('Creature')) { out.midrange += 0.2*q; }
          }
          return out;
        })();
        const nextMeta = { ...(data?.meta || {}), archetype: scores } as any;
        await supabase.from('decks').update({ meta: nextMeta }).eq('id', data.id);
      }
    } catch {}

    // ANALYTICS: Track deck updates
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("deck_updated", { deck_id: data.id, user_id: user.id, fields: Object.keys(update) }); } catch {}

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

