import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function norm(s:string){ return String(s||'').trim(); }

export async function POST(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status:401 });
    const body = await req.json().catch(()=>({}));
    const intent = body?.intent || {};
    // Compose a naive deck_text
    const colors: string[] = Array.isArray(intent?.colors)? intent.colors : [];
    const format: string = String(intent?.format||'Commander');
    const title: string = String(intent?.title||'Draft Deck');
    const must: string[] = Array.isArray(intent?.mustInclude)? intent.mustInclude : [];

    // Land base heuristic
    const basics: Record<string,string> = { W:'Plains', U:'Island', B:'Swamp', R:'Mountain', G:'Forest' };
    const landColors = colors.length? colors : ['U','R'];
    const totalLands = format.toLowerCase().includes('commander') ? 36 : 24;
    const per = Math.max(1, Math.floor(totalLands/Math.max(1, landColors.length)));
    const landLines: string[] = landColors.map(c=>`${per} ${basics[c]}`).slice(0,5);

    // Quotas
    const ramp = format.toLowerCase().includes('commander') ? 10 : 6;
    const draw = format.toLowerCase().includes('commander') ? 8 : 6;
    const removal = format.toLowerCase().includes('commander') ? 8 : 6;

    // Simple fillers
    const rampLines = Array.from({length: Math.max(1,ramp- (must.length>0?1:0))}).map(()=>`1 Rampant Growth`);
    const drawLines = Array.from({length: Math.max(1,draw)}).map(()=>`1 Opt`);
    const removalLines = Array.from({length: Math.max(1,removal)}).map(()=>`1 Go for the Throat`);

    const mustLines = must.map(n=>`1 ${norm(n)}`);
    const deckText = [...mustLines, ...rampLines, ...drawLines, ...removalLines, ...landLines].join('\n');

    // Insert deck
    const plan = String(intent?.plan||'optimized');
    const colorNames = landColors.map(c=>({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[c])).join('/');
    const deckTitle = title || `${format} ${colorNames} ${String(intent?.archetype||'Draft')}`.trim();

    const { data: deckIns, error: dErr } = await sb.from('decks').insert({ user_id: user.id, title: deckTitle, format: format, plan: plan, is_public: false }).select('id').single();
    if (dErr) return NextResponse.json({ ok:false, error: dErr.message }, { status:500 });
    const deckId = deckIns?.id as string;

    // Upsert cards
    const lines = deckText.split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean);
    for (const l of lines.slice(0,200)){
      const m = l.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      const qty = m? Math.max(1, parseInt(m[1],10)) : 1;
      const name = m? m[2] : l;
      const { error: cardErr } = await sb.from('deck_cards').insert({ deck_id: deckId, name, qty }).select('id').single();
      // Ignore individual card insert errors to keep flow resilient
    }

    // Embed compact intent in URL (?i=base64url) for Build Assistant prefill
    let enc = '';
    try { const raw = JSON.stringify(intent||{}); enc = Buffer.from(raw).toString('base64url'); } catch {}
    const url = `/my-decks/${encodeURIComponent(deckId)}${enc?`?i=${enc}`:''}`;
    return NextResponse.json({ ok:true, id: deckId, title: deckTitle, url, intent });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}