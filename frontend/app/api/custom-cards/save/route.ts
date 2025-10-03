import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(n: string){ return (n||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,48) || 'card'; }

export async function POST(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });

    const body = await req.json();
    const value = body?.value || body; // expected to be the card object
    const title = String(body?.title || (Array.isArray(value?.nameParts)? value.nameParts.join(' ') : 'Custom Card'));
    const makePublic = String(req.nextUrl.searchParams.get('public')||'') === '1';

    // Determine Pro flag from user metadata
    const isPro = !!(user.user_metadata && (user.user_metadata as any).pro);
    const max = isPro ? 20 : 5;

    // Enforce quota
    const { count, error: cntErr } = await sb.from('custom_cards').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (!cntErr && typeof count === 'number' && count >= max) {
      return NextResponse.json({ ok:false, error:'quota_exceeded', max }, { status: 400 });
    }

    const row = { user_id: user.id, title, data: value } as any;
    if (makePublic) row.public_slug = `${slugify(title)}-${Math.random().toString(36).slice(2,8)}`;

    const { data: ins, error } = await sb.from('custom_cards').insert(row).select('id, public_slug').single();
    if (error) {
      const msg = String(error?.message||'error');
      if (/custom_cards/i.test(msg) && /does not exist|relation/.test(msg)) {
        return NextResponse.json({ ok:false, error:'missing_table', hint:`Create table custom_cards (id uuid default gen_random_uuid() primary key, user_id uuid not null, title text, data jsonb not null, public_slug text unique, created_at timestamptz default now()); Add RLS owner-only.` }, { status: 500 });
      }
      return NextResponse.json({ ok:false, error: msg }, { status: 500 });
    }

    const id = ins?.id;
    const slug = ins?.public_slug || id;
    const base = process.env.NEXT_PUBLIC_BASE_URL || '';
    const url = slug ? `${base}/cards/${encodeURIComponent(slug)}` : null;
    return NextResponse.json({ ok:true, id, slug, url, max });
  } catch(e: any){
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status: 500 });
  }
}