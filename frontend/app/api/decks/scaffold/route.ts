import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizedNameForDeckPersistence } from '@/lib/deck/cleanCardName';
import { getServerSupabase } from '@/lib/server-supabase';
import { buildGroundedScaffoldDeck } from '@/lib/deck/scaffold-builder';

export const runtime = 'nodejs';

function norm(s:string){ return String(s||'').trim(); }

export async function POST(req: NextRequest){
  try{
    let sb = await createClient();
    let { data: ures } = await sb.auth.getUser();
    let user = ures?.user;

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          sb = bearerSupabase;
        }
      }
    }

    if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status:401 });
    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    const body = await req.json().catch(()=>({}));
    const intent = body?.intent || {};
    const format: string = String(intent?.format || 'Commander');
    const title: string = String(intent?.title || 'Draft Deck');
    const plan = String(intent?.plan || 'optimized');
    const colorNames = (Array.isArray(intent?.colors) ? intent.colors : []).map((c:string)=>({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[String(c).toUpperCase()] || String(c))).join('/');
    const deckTitle = title || `${format} ${colorNames} ${String(intent?.archetype||intent?.theme||'Draft')}`.trim();
    const admin = await getServerSupabase();
    const scaffold = await buildGroundedScaffoldDeck(admin, {
      colors: Array.isArray(intent?.colors) ? intent.colors : [],
      format,
      title: deckTitle,
      mustInclude: Array.isArray(intent?.mustInclude) ? intent.mustInclude.map((name: string) => norm(name)).filter(Boolean) : [],
      archetype: typeof intent?.archetype === "string" ? intent.archetype : null,
      theme: typeof intent?.theme === "string" ? intent.theme : null,
      vibe: typeof intent?.vibe === "string" ? intent.vibe : null,
      commander: typeof intent?.commander === "string" ? norm(intent.commander) : typeof intent?.commanderName === "string" ? norm(intent.commanderName) : null,
      budget: typeof intent?.budget === "string" ? intent.budget : null,
      power: typeof intent?.power === "string" ? intent.power : null,
      plan,
    }, {
      userId: user?.id ?? null,
      isPro,
      isGuest: false,
    });
    const deckText = scaffold.deckText;

    // Preview mode: return deck data without creating
    if (body?.preview === true) {
      return NextResponse.json({
        ok: true,
        preview: true,
        decklist: scaffold.decklist,
        commander: scaffold.commander || deckTitle,
        colors: scaffold.colors,
        overallAim: scaffold.overallAim,
        title: scaffold.title,
        deckText: scaffold.deckText,
        format: scaffold.format,
        plan: scaffold.plan,
      });
    }

    // Insert deck
    const { data: deckIns, error: dErr } = await sb.from('decks').insert({ user_id: user.id, title: scaffold.title, format: scaffold.format, plan: scaffold.plan, is_public: false, commander: scaffold.commander, deck_text: scaffold.deckText }).select('id').single();
    if (dErr) return NextResponse.json({ ok:false, error: dErr.message }, { status:500 });
    const deckId = deckIns?.id as string;

    // Upsert cards
    const lines = scaffold.deckText.split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean);
    for (const l of lines.slice(0,200)){
      const m = l.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      const qty = m? Math.max(1, parseInt(m[1],10)) : 1;
      const name = sanitizedNameForDeckPersistence(m? m[2] : l);
      if (!name) continue;
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
