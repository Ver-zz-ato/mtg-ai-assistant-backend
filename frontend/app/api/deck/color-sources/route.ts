// app/api/deck/color-sources/route.ts
import type { NextRequest } from "next/server";

// Simple in-process cache for Scryfall lookups
// persists across hot reloads in dev
const cache: Map<string, { type_line?: string; oracle_text?: string | null }> = (globalThis as any).__csCache ?? new Map();
(globalThis as any).__csCache = cache;

async function fetchCard(name: string) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const j: any = await r.json().catch(()=>null);
  if (!j) return null;
  const card = { type_line: j?.type_line, oracle_text: j?.oracle_text ?? j?.card_faces?.[0]?.oracle_text ?? null };
  cache.set(key, card);
  return card;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const cards: Array<{ name: string; qty: number }> = Array.isArray(body?.cards) ? body.cards : [];
    if (!cards.length) {
      return new Response(JSON.stringify({ ok:false, error: "no cards provided" }), { status: 400 });
    }
    const byNameQty = new Map<string, number>();
    for (const c of cards) {
      const name = String(c?.name||"").trim(); const qty = Math.max(0, Number(c?.qty)||0);
      if (!name || !qty) continue;
      byNameQty.set(name, (byNameQty.get(name)||0) + qty);
    }
    const unique = Array.from(byNameQty.keys()).slice(0, 300);
    let W=0,U=0,B=0,R=0,G=0;
    const anyColorRe = /any color/i;

    for (const name of unique) {
      const card = await fetchCard(name);
      if (!card) continue;
      const t = String(card.type_line||"");
      const o = String(card.oracle_text||"");
      const qty = byNameQty.get(name) || 0;
      const grant = (sym: string, n: number) => {
        if (sym==='W') W+=n; else if (sym==='U') U+=n; else if (sym==='B') B+=n; else if (sym==='R') R+=n; else if (sym==='G') G+=n;
      };
      if (/Plains/i.test(t)) grant('W', qty);
      if (/Island/i.test(t)) grant('U', qty);
      if (/Swamp/i.test(t)) grant('B', qty);
      if (/Mountain/i.test(t)) grant('R', qty);
      if (/Forest/i.test(t)) grant('G', qty);
      if (anyColorRe.test(o)) { ['W','U','B','R','G'].forEach(sym=>grant(sym, qty)); }
      if (/{W}/.test(o)) grant('W', qty);
      if (/{U}/.test(o)) grant('U', qty);
      if (/{B}/.test(o)) grant('B', qty);
      if (/{R}/.test(o)) grant('R', qty);
      if (/{G}/.test(o)) grant('G', qty);
    }

    return new Response(JSON.stringify({ ok:true, sources: { W,U,B,R,G } }), { headers: { 'content-type':'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'failed' }), { status: 500 });
  }
}
