import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

async function scryfallBatch(names: string[], supabase: any) {
  const identifiers = Array.from(new Set(names.filter(Boolean))).slice(0, 600).map((n) => ({ name: n }));
  const out: Record<string, any> = {};
  if (!identifiers.length) return out;
  try {
    const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
    const j:any = await r.json().catch(()=>({}));
    const rows:any[] = Array.isArray(j?.data) ? j.data : [];
    for (const c of rows) out[norm(c?.name||'')] = c;
    try {
      const up = rows.map((c:any)=>{
        const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
        return {
          name: norm(c?.name||''), small: img.small||null, normal: img.normal||null, art_crop: img.art_crop||null,
          type_line: c?.type_line || null, oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
          updated_at: new Date().toISOString(),
        };
      });
      if (up.length) await supabase.from('scryfall_cache').upsert(up, { onConflict: 'name' });
    } catch {}
  } catch {}
  return out;
}

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const { data: decks } = await supabase.from('decks').select('id').eq('user_id', user.id).limit(200);
    const ids = Array.isArray(decks) ? (decks as any[]).map(x=>String(x.id)) : [];
    let updated = 0;
    for (const id of ids) {
      const { data: cards } = await supabase.from('deck_cards').select('name, qty').eq('deck_id', id).limit(400);
      const arr = Array.isArray(cards) ? (cards as any[]).map(x=>({ name:String(x.name), qty: Number(x.qty||1) })) : [];
      if (!arr.length) continue;
      const details = await scryfallBatch(arr.map(a=>a.name), supabase);
      const w = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
      for (const { name, qty } of arr) {
        const card = details[norm(name)];
        const type = String(card?.type_line||'');
        const text = String(card?.oracle_text||'').toLowerCase();
        const cmc = Number(card?.cmc||0);
        const q = Math.min(Math.max(Number(qty||1),1),4);
        if (type.includes('Creature')) { w.aggro += 0.5*q; w.midrange += 0.2*q; }
        if (type.includes('Instant') || type.includes('Sorcery')) { w.control += 0.2*q; w.combo += 0.1*q; }
        if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { w.control += 0.6*q; }
        if (/search your library/.test(text) || /tutor/.test(text)) { w.combo += 0.6*q; }
        if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
          || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) { w.stax += 0.8*q; }
        if (cmc <= 2 && type.includes('Creature')) { w.aggro += 0.2*q; }
        if (cmc >= 5 && type.includes('Creature')) { w.midrange += 0.2*q; }
      }
      const { data: cur } = await supabase.from('decks').select('meta').eq('id', id).single();
      const nextMeta = { ...(cur?.meta||{}), archetype: w } as any;
      await supabase.from('decks').update({ meta: nextMeta }).eq('id', id);
      updated += 1;
    }
    return NextResponse.json({ ok:true, updated, total: ids.length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
