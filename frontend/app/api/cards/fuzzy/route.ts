import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim(); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 50) : [];
    if (!names.length) return NextResponse.json({ ok:false, error:'names required' }, { status:400 });

    const supabase = await createClient();
    const results: Record<string, { suggestion?: string; all?: string[] }> = {};

  function cleanup(raw: string): string {
      let s = String(raw||'').trim();
      // Strip sideboard prefix
      s = s.replace(/^SB:\s*/i, '');
      // Ampersand-delimited like "2x&Swamp&Warhammer" => take middle token as name
      if (s.includes('&')) {
        const parts = s.split('&').map(t=>t.trim()).filter(Boolean);
        if (parts.length >= 2) {
          // If first token is a qty like 2 or 2x, use second
          const first = parts[0].toLowerCase();
          if (/^\d+x?$/.test(first)) return parts[1];
          // Otherwise if we have 3 tokens, likely [qty, name, set]
          if (parts.length >= 3) return parts[1];
        }
      }
      // Quantity prefix: "2x Card" or "2 Card"
      let m = s.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/); if (m) return m[2];
      // Bullet/dash prefix: "- Card"
      m = s.match(/^[-•]\s*(.+)$/); if (m) return m[1];
      // CSV-like "Card,18" => take name
      m = s.match(/^(.+?),(?:\s*)"?\d+"?\s*$/); if (m) return m[1];
      // Quotes
      s = s.replace(/^"|"$/g, '');
      return s.trim();
    }

  for (const raw of names) {
      const q = String(raw||'').trim();
      const q0 = cleanup(q);
      const qn = norm(q0);
      let all: string[] = [];

      // 1) Our cache (scryfall_cache) first: exact, startsWith, contains
      try {
        const { data } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', `%${q0.replace(/%/g,'').replace(/_/g,' ')}%`)
          .limit(12);
        const fromDb = Array.isArray(data) ? (data as any[]).map(r=>String(r.name)) : [];
        // Prefer startsWith matches first
        const starts = fromDb.filter(n => norm(n).startsWith(qn));
        const rest = fromDb.filter(n => !norm(n).startsWith(qn));
        all = Array.from(new Set([ ...starts, ...rest ])).slice(0, 12);
      } catch {}

      // 2) If still empty, use Scryfall autocomplete (cheap) instead of named for many calls
      if (all.length === 0) {
        try {
          const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q0)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          all = arr.slice(0, 12).map((s:any)=>String(s));
        } catch {}
      }

      // 3) If still empty, try named?fuzzy with the whole string
      if (all.length === 0) {
        try {
          const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const n = String(j?.name || '').trim();
          if (n) all = [n];
        } catch {}
      }

      // 4) If still empty, try a trimmed token before comma or first word
      if (all.length === 0) {
        const token = q0.split(',')[0].split(/\s+/)[0] || q0;
        try {
          const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(token)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          all = arr.slice(0, 12).map((s:any)=>String(s));
        } catch {}
      }

      const suggestion = all[0];
      results[q] = { suggestion, all };
    }

    return NextResponse.json({ ok:true, results });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
