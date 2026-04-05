import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { sanitizedNameForDeckPersistence } from '@/lib/deck/cleanCardName';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const body = await req.json().catch(()=>({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.filter((s:string)=>!!s) : [];
    const qty: number = Math.max(1, Number(body?.qty||1));
    let wishlist_id: string = String(body?.wishlist_id||'');

    if (!names.length) return NextResponse.json({ ok:false, error:'names required' }, { status:400 });

    /** Align persisted `wishlist_items.name` with `deck_cards` / `collections/cards` POST: sanitize + same-origin fuzzy when unambiguous top suggestion differs. */
    const resolvedBySanitized = new Map<string, string>();
    if (!body.skipValidation) {
      const sanitizedKeys: string[] = [];
      for (const raw of names) {
        const s = sanitizedNameForDeckPersistence(String(raw));
        if (s) sanitizedKeys.push(s);
      }
      const uniq = [...new Set(sanitizedKeys)];
      for (let i = 0; i < uniq.length; i += 50) {
        const chunk = uniq.slice(i, i + 50);
        try {
          const fuzzyRes = await fetch(`${req.nextUrl.origin}/api/cards/fuzzy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: chunk }),
          });
          const fuzzyData = await fuzzyRes.json().catch(() => ({}));
          const results = (fuzzyData as { results?: Record<string, { suggestion?: string }> })?.results ?? {};
          for (const key of chunk) {
            const suggestion = results[key]?.suggestion;
            let final = key;
            if (suggestion && suggestion.toLowerCase() !== key.toLowerCase()) final = suggestion;
            resolvedBySanitized.set(key, final);
          }
        } catch (e) {
          console.warn('[wishlists/add] Name validation failed, using sanitized keys:', e);
          for (const key of chunk) resolvedBySanitized.set(key, key);
        }
      }
    }

    // Ensure a wishlist exists (default 'My Wishlist') if none provided
    if (!wishlist_id) {
      const { data: wl } = await (supabase as any)
        .from('wishlists')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (wl?.id) wishlist_id = wl.id as string;
      else {
        const { data: ins, error: insErr } = await (supabase as any)
          .from('wishlists')
          .insert({ user_id: user.id, name: 'My Wishlist', is_public: false })
          .select('id')
          .maybeSingle();
        if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 });
        wishlist_id = (ins as any)?.id as string;
      }
    }

    // Upsert items (increment qty if existing)
    for (const raw of names) {
      const sanitized = sanitizedNameForDeckPersistence(String(raw));
      if (!sanitized) continue;
      const name = body.skipValidation
        ? sanitized
        : (resolvedBySanitized.get(sanitized) ?? sanitized);
      const { data: existing } = await (supabase as any)
        .from('wishlist_items')
        .select('id, qty')
        .eq('wishlist_id', wishlist_id)
        .eq('name', name)
        .maybeSingle();
      if (existing?.id) {
        const { error: upErr } = await (supabase as any).from('wishlist_items').update({ qty: Number(existing.qty||0) + qty }).eq('id', existing.id);
        if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 });
      } else {
        const { error: insErr } = await (supabase as any).from('wishlist_items').insert({ wishlist_id, name, qty });
        if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 });
      }
    }

    // Also mirror into auth user metadata wishlist so Profile textarea reflects additions
    try {
      const current = Array.isArray((user?.user_metadata||{}).wishlist) ? ((user?.user_metadata as any).wishlist as string[]) : [];
      // Load canonicalizer on server
      const { canonicalize } = await import('@/lib/cards/canonicalize');
      const mergedSet = new Set<string>(current.map(s=>String(s)));
      for (const raw of names) {
        const sanitized = sanitizedNameForDeckPersistence(String(raw));
        if (!sanitized) continue;
        const persisted = body.skipValidation
          ? sanitized
          : (resolvedBySanitized.get(sanitized) ?? sanitized);
        const c = canonicalize(persisted).canonicalName || persisted;
        if (c) mergedSet.add(c);
      }
      const merged = Array.from(mergedSet);
      // Also compute canonical array
      const mergedCanonical = merged.map(n=> canonicalize(n).canonicalName || n);
      try { await (supabase as any).auth.updateUser({ data: { wishlist: merged, wishlist_canonical: mergedCanonical } }); } catch {}
    } catch {}

    // ANALYTICS: Track wishlist item addition
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("wishlist_item_added", { wishlist_id, user_id: user.id, count: names.length }); } catch {}

    return NextResponse.json({ ok:true, wishlist_id });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}
