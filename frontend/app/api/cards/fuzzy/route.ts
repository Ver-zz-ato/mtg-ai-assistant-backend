import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim(); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 50) : [];
    if (!names.length) return NextResponse.json({ ok:false, error:'names required' }, { status:400 });

    const supabase = await createClient();
    const results: Record<string, { suggestion?: string; all?: string[] }> = {};

    for (const raw of names) {
      const q = String(raw||'').trim();
      const qn = norm(q);
      let all: string[] = [];

      // 1) Our cache (scryfall_cache) first: exact, startsWith, contains
      try {
        const { data } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', `%${q.replace(/%/g,'').replace(/_/g,' ')}%`)
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
          const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          all = arr.slice(0, 12).map((s:any)=>String(s));
        } catch {}
      }

      // 3) If still empty, try named?fuzzy with the whole string
      if (all.length === 0) {
        try {
          const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const n = String(j?.name || '').trim();
          if (n) all = [n];
        } catch {}
      }

      // 4) If still empty, try a trimmed token before comma or first word
      if (all.length === 0) {
        const token = q.split(',')[0].split(/\s+/)[0] || q;
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
