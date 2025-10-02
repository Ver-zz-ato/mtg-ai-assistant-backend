"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { capture } from "@/lib/ph";
import { canonicalize } from "@/lib/cards/canonicalizeClient";
import { containsProfanity } from "@/lib/profanity";

const AVATAR_FILES = Array.from({ length: 20 }).map((_, i) => `/avatars/${String(i+1).padStart(2,'0')}.svg`);
const COLOR_PIE = ["W","U","B","R","G"] as const;
const FORMATS = ["Commander","Modern","Standard","Pioneer","Pauper"] as const;

type Usage = { messages: number; input_tokens: number; output_tokens: number; cost_usd: number };

function norm(name: string): string { return String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }
function cleanName(s: string): string {
  return String(s||'')
    .replace(/\s*\(.*?\)\s*/g, '') // remove parentheticals
    .replace(/\s*[-–—:|].*$/, '')   // strip trailing descriptors after dash/colon/pipe
    .replace(/\[[^\]]+\]/g, '')   // remove bracketed tags
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ProfileClient() {
  // component body continues
  const sb = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [pro, setPro] = useState<boolean>(false);
  const [colors, setColors] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [favCommander, setFavCommander] = useState<string>("");
  const [signatureDeckId, setSignatureDeckId] = useState<string>("");
  const [wishlist, setWishlist] = useState<string>("");
  const [tools, setTools] = useState<{ prob_runs?:number; prob_saves?:number; mull_iters_total?:number }>({});
  const [customCard, setCustomCard] = useState<any>(null);

  const [usage, setUsage] = useState<Usage | null>(null);
  const [deckCount, setDeckCount] = useState<number>(0);
  const [collectionCount, setCollectionCount] = useState<number>(0);
  const [recentDecks, setRecentDecks] = useState<Array<{ id:string; title:string; commander?: string|null; deck_text?: string|null }>>([]);
  const [pinnedDeckIds, setPinnedDeckIds] = useState<string[]>([]);
  const [deckBg, setDeckBg] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [topCards, setTopCards] = useState<Record<string, string[]>>({});

  const [newPassword, setNewPassword] = useState<string>("");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [popularCommanderAvatars, setPopularCommanderAvatars] = useState<string[]>([]);

  // Load user + metadata
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        try { capture('profile_view'); } catch {}
        const { data: ures } = await sb.auth.getUser();
        const u = ures?.user;
        setUserEmail(u?.email || "");
        const md: any = u?.user_metadata || {};
        setUsername((md.username ?? "").toString());
        setAvatar((md.avatar ?? AVATAR_FILES[0]).toString());
        setPro(Boolean(md.pro));
        setColors(Array.isArray(md.profile_colors) ? md.profile_colors : []);
        setFormats(Array.isArray(md.favorite_formats) ? md.favorite_formats : []);
        setFavCommander((md.favorite_commander ?? "").toString());
        setSignatureDeckId((md.signature_deck_id ?? "").toString());
        setWishlist(Array.isArray(md.wishlist) ? (md.wishlist as string[]).join("\n") : "");
        try { setTools((md.tools||{}) as any); } catch {}
        try { if (md.custom_card) setCustomCard(md.custom_card); } catch {}

        // Usage summary
        try {
          const r = await fetch("/api/me/usage/summary", { cache: "no-store" });
          const j = await r.json().catch(()=>({}));
          if (r.ok && j?.ok) setUsage(j.totals);
        } catch {}

        // Counts
        if (u?.id) {
          const { count: dcount } = await sb.from("decks").select("id", { count: 'exact', head: true }).eq("user_id", u.id);
          setDeckCount(dcount ?? 0);
          const { count: ccount } = await sb.from("collections").select("id", { count: 'exact', head: true }).eq("user_id", u.id);
          setCollectionCount(ccount ?? 0);
          const { data: rdecks } = await sb.from("decks").select("id,title,deck_text,commander").eq("user_id", u.id).order("created_at", { ascending: false }).limit(10);
          const list = (rdecks as any[])?.map(d => ({ id: d.id, title: d.title || 'Untitled', deck_text: d.deck_text || '', commander: d.commander || null })) || [];
          setRecentDecks(list);
          // Load current pinned list from public profile
          try {
            const { data: prof } = await sb.from('profiles_public').select('pinned_deck_ids').eq('id', u.id).maybeSingle();
            const pins = Array.isArray((prof as any)?.pinned_deck_ids) ? (prof as any).pinned_deck_ids as string[] : [];
            setPinnedDeckIds(pins.slice(0,3));
          } catch {}
          // load likes for these
          try {
            const results = await Promise.all(list.map(async d => {
              try { const r = await fetch(`/api/decks/${d.id}/likes`, { cache: 'no-store' }); const j = await r.json().catch(()=>({})); return [d.id, (j?.ok? { count: j.count||0, liked: !!j.liked } : { count: 0, liked: false })] as const; } catch { return [d.id, { count: 0, liked: false }] as const; }
            }));
            const map: Record<string, {count:number; liked:boolean}> = {} as any;
            for (const [id, v] of results) map[id] = v;
            setLikes(map);
          } catch {}
          try {
            // Build a set of candidate names across all decks
            const names = new Set<string>(list.flatMap(d => {
              const arr: string[] = [];
              if (d.commander) arr.push(cleanName(String(d.commander)));
              if (d.title) arr.push(cleanName(String(d.title)));
              const firstLine = String(d.deck_text||'').split(/\r?\n/).find(l => !!l?.trim());
              if (firstLine) { const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/); arr.push(cleanName(m ? m[2] : firstLine)); }
              return arr;
            }).filter(Boolean));

            // As a robust fallback, fetch top few deck_cards for each deck
            const topCardsByDeck = new Map<string, string[]>();
            try {
              const results = await Promise.all(list.map(async d => {
                const { data } = await sb.from('deck_cards').select('name, qty').eq('deck_id', d.id).order('qty', { ascending: false }).limit(5);
                const nm = Array.isArray(data) ? (data as any[]).map(x => String(x.name)) : [];
                return { id: d.id, names: nm };
              }));
              for (const r of results) topCardsByDeck.set(r.id, r.names);
              // add into prefetch set
              for (const arr of topCardsByDeck.values()) for (const n of arr) names.add(cleanName(n));
              // also stash for render fallback
              const obj: Record<string,string[]> = {};
              for (const [k,v] of topCardsByDeck.entries()) obj[k] = v;
              setTopCards(obj);
            } catch {}

            if (names.size) {
              const { getImagesForNames } = await import("@/lib/scryfall");
              const m = await getImagesForNames(Array.from(names));
              const o: Record<string,string> = {};
              m.forEach((v:any,k:string)=>{ o[norm(k)] = v.art_crop || v.normal || v.small; });
              setDeckBg(o);
            }
          } catch {}
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  function toggle<T extends string>(arr: T[], v: T): T[] { return arr.includes(v) ? arr.filter(x=>x!==v) : [...arr, v]; }

  async function save() {
    setSaving(true);
    try {
      // Profanity checks
      if (username && containsProfanity(username)) throw new Error('Username contains disallowed words.');
      if (favCommander && containsProfanity(favCommander)) throw new Error('Favorite commander contains disallowed words.');
      for (const line of wishlist.split(/\r?\n/)) { if (line.trim() && containsProfanity(line)) throw new Error('Wishlist contains disallowed words.'); }

      // Username change throttle (30 days)
      try {
        const { data: ures } = await sb.auth.getUser();
        const md0: any = ures?.user?.user_metadata || {};
        const last = md0.last_username_change ? new Date(md0.last_username_change) : null;
        if (username && username !== (md0.username || '') && last && (Date.now() - last.getTime()) < 30*24*60*60*1000) {
          throw new Error('You can change your username only once every 30 days.');
        }
      } catch {}

      const rawWishlist = wishlist.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const wishlistCanonical = rawWishlist.map(s => canonicalize(s).canonicalName || s);

      const md = {
        username: username || null,
        avatar: avatar || null,
        pro,
        profile_colors: colors,
        favorite_formats: formats,
        favorite_commander: favCommander || null,
        signature_deck_id: signatureDeckId || null,
        wishlist: rawWishlist,
        wishlist_canonical: wishlistCanonical,
        ...(username ? { last_username_change: new Date().toISOString() } : {}),
      };
      const { error } = await sb.auth.updateUser({ data: md });
      if (error) throw error;
      try { capture('profile_wishlist_save', { count: wishlist.split(/\r?\n/).filter(Boolean).length }); } catch {}
      if (username) { try { capture('profile_username_change'); } catch {} }
      if (favCommander) { try { capture('profile_fav_commander_set'); } catch {} }
      alert("Profile saved");
    } catch (e:any) {
      alert(e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  async function changePassword() {
    if (!currentPassword) { alert('Please enter your current password.'); return; }
    if (!newPassword || newPassword.length < 8) { alert("Use at least 8 characters."); return; }
    try {
      // Validate current password by signing in
      const email = userEmail;
      if (!email) throw new Error('Missing email on session. Please sign out and sign back in.');
      const r = await sb.auth.signInWithPassword({ email, password: currentPassword });
      if (r.error) throw r.error;
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword("");
      setNewPassword("");
      alert("Password updated");
    } catch (e:any) {
      alert(e?.message || "Failed to update password");
    }
  }

  const gradient = useMemo(() => {
    const map: Record<string,string> = { W: '#e5e7eb', U: '#60a5fa', B: '#64748b', R: '#f87171', G: '#34d399' };
    const cols = (colors.length ? colors : ["U","B"]).map(c => map[c] || '#888');
    return `linear-gradient(90deg, ${cols.join(', ')})`;
  }, [colors]);

  // Fetch top commander avatars once
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('https://api.scryfall.com/cards/search?q=is%3Acommander+legal%3Acommander+game%3Apaper&order=edhrec', { cache: 'force-cache' });
        const j: any = await r.json().catch(()=>({}));
        const data: any[] = Array.isArray(j?.data) ? j.data : [];
        const imgs: string[] = [];
        for (const card of data.slice(0, 24)) {
          const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
          const url = img.art_crop || img.normal || img.small;
          if (url) imgs.push(url);
        }
        if (imgs.length) setPopularCommanderAvatars(imgs);
      } catch {}
    })();
  }, []);

  // Lazy art fetch fallback for any deck still missing an image (fuzzy Named)
  useEffect(() => {
    (async () => {
      const pending = recentDecks.filter(d => {
        const candidates: string[] = [];
        if (d.commander) candidates.push(cleanName(String(d.commander)));
        if (d.title) candidates.push(cleanName(String(d.title)));
        const firstLine = String(d.deck_text||'').split(/\r?\n/).find(l=>!!l?.trim());
        if (firstLine) { const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(cleanName(m ? m[2] : firstLine)); }
        for (const n of (topCards[d.id] || []).slice(0,5)) candidates.push(cleanName(n));
        let found = false; for (const c of candidates) { if (deckBg[norm(c)]) { found = true; break; } }
        return !found;
      }).slice(0, 12); // be gentle but cover most lists
      for (const d of pending) {
        const candidates: string[] = [];
        if (d.commander) candidates.push(cleanName(String(d.commander)));
        if (d.title) candidates.push(cleanName(String(d.title)));
        const firstLine = String(d.deck_text||'').split(/\r?\n/).find(l=>!!l?.trim());
        if (firstLine) { const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(cleanName(m ? m[2] : firstLine)); }
        for (const n of (topCards[d.id] || []).slice(0,5)) candidates.push(cleanName(n));
        // Try a collection POST first (more reliable than fuzzy for common cards)
        try {
          const identifiers = Array.from(new Set(candidates)).slice(0, 20).map(n=>({ name: n }));
          if (identifiers.length) {
            const cr = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ identifiers }) });
            const cj: any = await cr.json().catch(()=>({}));
            const data: any[] = Array.isArray(cj?.data) ? cj.data : [];
            for (const card of data) {
              const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
              const url = img.art_crop || img.normal || img.small;
              if (url) { setDeckBg(prev => ({ ...prev, [norm(card?.name||'')]: url })); break; }
            }
          }
        } catch {}
        // If still nothing, fuzzy each candidate
        for (const c of candidates) {
          try {
            const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(c)}`);
            if (!fr.ok) continue;
            const card: any = await fr.json().catch(()=>({}));
            const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
            const url = img.art_crop || img.normal || img.small;
            if (url) { setDeckBg(prev => ({ ...prev, [norm(card?.name || c)]: url })); break; }
          } catch {}
        }
      }
    })();
  }, [recentDecks, deckBg]);

  // Derive badges on client to show in the right rail
  const badges = useMemo(() => {
    const out: { key: string; label: string; emoji: string; desc: string }[] = [];
    if (deckCount >= 1) out.push({ key: 'first_deck', label: 'First Deck', emoji: '🏆', desc: 'Created your first deck' });
    if (deckCount >= 5) out.push({ key: 'brewer_i', label: 'Brewer I', emoji: '⚗️', desc: 'Built 5+ decks' });
    if (deckCount >= 15) out.push({ key: 'brewer_ii', label: 'Brewer II', emoji: '⚗️', desc: 'Built 15+ decks' });
    if (deckCount >= 30) out.push({ key: 'brewer_iii', label: 'Brewer III', emoji: '⚗️', desc: 'Built 30+ decks' });
    if (collectionCount >= 3) out.push({ key: 'curator_i', label: 'Curator I', emoji: '📚', desc: 'Maintain 3+ collections' });
    if (collectionCount >= 10) out.push({ key: 'curator_ii', label: 'Curator II', emoji: '📚', desc: 'Maintain 10+ collections' });
    if (collectionCount >= 25) out.push({ key: 'curator_iii', label: 'Curator III', emoji: '📚', desc: 'Maintain 25+ collections' });
    if ((usage?.messages || 0) >= 50) out.push({ key: 'chatterbox', label: 'Chatterbox', emoji: '💬', desc: '50+ messages in 30d' });
    if ((tools?.prob_runs||0) >= 10) out.push({ key:'mathlete', label:'Mathlete', emoji:'∑', desc:'Run Probability tool 10 times' });
    if ((tools?.prob_saves||0) >= 5) out.push({ key:'scenario_collector', label:'Scenario Collector', emoji:'💾', desc:'Save 5 probability scenarios' });
    if ((tools?.mull_iters_total||0) >= 25000) out.push({ key:'mulligan_master', label:'Mulligan Master', emoji:'♻️', desc:'Run 25k+ mulligan iterations' });
    return out;
  }, [deckCount, collectionCount, usage?.messages, tools?.prob_runs, tools?.prob_saves, tools?.mull_iters_total]);

  // Extra analytical badges derived from recent decks: On-Curve 90, Mana Maestro, Combomancer
  const [extraBadges, setExtraBadges] = useState<Array<{ key:string; label:string; emoji:string; desc:string }>>([]);
  React.useEffect(()=>{
    (async()=>{
      try{
        const picks = recentDecks.slice(0,5);
        if (!picks.length) { setExtraBadges([]); return; }
        function comb(n:number,k:number){ if(k<0||k>n) return 0; if(k===0||k===n) return 1; k=Math.min(k,n-k); let r=1; for(let i=1;i<=k;i++){ r=r*(n-k+i)/i; } return r; }
        function hyperAtLeast(k:number,K:number,N:number,n:number){ let p=0; for(let i=k;i<=Math.min(n,K);i++){ const a=comb(K,i), b=comb(N-K, n-i), c=comb(N,n); p+= c===0?0:(a*b)/c; } return Math.max(0, Math.min(1,p)); }
        async function landCount(deckId:string){ const r=await fetch(`/api/deck/analyze`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText: (await (await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`)).json()).cards.map((c:any)=>`${c.qty} ${c.name}`).join('\n'), format:'Commander', useScryfall:true }) }); const j=await r.json().catch(()=>({})); return { lands:Number(j?.counts?.lands||0), total:Number((await (await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`)).json()).cards.reduce((s:any,c:any)=>s+Number(c.qty||0),0)||99) }; }
        async function colorSources(deckId:string){ const jr=await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`); const jj=await jr.json().catch(()=>({})); const cards:Array<{name:string;qty:number}>=Array.isArray(jj?.cards)?jj.cards:[]; const sr=await fetch('/api/deck/color-sources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cards})}); const sj=await sr.json().catch(()=>({})); const src=sj?.sources||{W:0,U:0,B:0,R:0,G:0}; return src; }
        async function hasCombo(deckId:string){ const r=await fetch('/api/deck/combos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deckId})}); const j=await r.json().catch(()=>({})); return Array.isArray(j?.present) && j.present.length>0; }
        let onCurve=false, maestro=false, combo=false;
        for (const d of picks){
          try{
            const { lands, total } = await landCount(d.id);
            const p4 = hyperAtLeast(4, lands, total||99, 7+3); if (p4>=0.90) onCurve = true;
          } catch{}
          try{
            const src = await colorSources(d.id);
            const cols = ['W','U','B','R','G'].filter(k=> (src as any)[k]>0);
            if (cols.length>=1){
              const counts = cols.map(k=>(src as any)[k]); const N = (await (await fetch(`/api/decks/cards?deckId=${encodeURIComponent(d.id)}`)).json()).cards.reduce((s:any,c:any)=>s+Number(c.qty||0),0)||99; const draws=7+2; const others = Math.max(0, N - counts.reduce((a,b)=>a+b,0)); function prob(){ function c(n:number,k:number){ if(k<0||k>n) return 0; if(k===0||k===n) return 1; k=Math.min(k,n-k); let r=1; for(let i=1;i<=k;i++){ r=r*(n-k+i)/i; } return r; } const bounds = counts.map(cn=>Math.min(cn, draws)); let totalP=0; function loop(i:number, acc:number[], left:number){ if(i===counts.length){ const sx=acc.reduce((a,b)=>a+b,0); if (sx>draws) return; const rest=draws-sx; const top=acc.reduce((accu,x,ii)=>accu*c(counts[ii],x),1)*c(others,rest); const bot=c(N,draws); totalP += bot===0?0:top/bot; return;} const min=1; for(let x=min;x<=Math.min(bounds[i], left); x++) loop(i+1,[...acc,x], left-x); } loop(0,[],draws); return Math.max(0, Math.min(1,totalP)); } const p=prob(); if (p>=0.85) maestro=true; }
          } catch{}
          try{ if (await hasCombo(d.id)) combo=true; } catch{}
        }
        const extra: any[] = [];
        if (onCurve) extra.push({ key:'on_curve_90', label:'On-Curve 90', emoji:'📈', desc:'≥90% to hit land drops T1–T4' });
        if (maestro) extra.push({ key:'mana_maestro', label:'Mana Maestro', emoji:'💧', desc:'High color odds by T3' });
        if (combo) extra.push({ key:'combomancer', label:'Combomancer', emoji:'✨', desc:'Includes at least one detected combo' });
        setExtraBadges(extra);
      } catch{ setExtraBadges([]); }
    })();
  }, [recentDecks.map(d=>d.id).join(',')]);

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-neutral-800" style={{ background: gradient }}>
        <div className="backdrop-blur-sm bg-black/50 rounded-xl p-4 flex items-center gap-4">
          <div className="relative z-[10000] group">
            {customCard?.art && (
              <>
                <img src={customCard.art} alt={customCard.name||'custom'} className="w-16 h-12 rounded object-cover border border-neutral-700" />
                <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-[9999] bg-black/90 border border-neutral-700 rounded p-2 shadow-xl w-[320px]">
{require('react').createElement(require('@/components/ProfileCardEditor').default, { mode:'view', onChange: () => {}, value: { nameParts: (String(customCard.name||'Custom Card').split(' ').slice(0,3) as any).concat(['','','']).slice(0,3) as [string,string,string], subtext: String(customCard.sub||''), artUrl: String(customCard.art||''), artist: String(customCard.artist||''), scryUri: String(customCard.scryfall||''), colorHint: (String(customCard.color||'U') as any), typeText: '—', pt: { p: 1, t: 1 }, mana: 0 } })}
                </div>
              </>
            )}
          </div>
          <img src={avatar || AVATAR_FILES[0]} alt="avatar" className="w-16 h-16 rounded-full object-cover bg-neutral-800" onError={(e:any)=>{e.currentTarget.src='/next.svg';}} />
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold truncate">{username || userEmail || 'Anonymous Mage'}</div>
            <div className="text-xs opacity-80">{pro ? 'Pro' : 'Free'} • Decks {deckCount} • Collections {collectionCount}</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pro} onChange={(e)=>setPro(e.target.checked)} /> Pro (coming soon)
          </label>
        </div>
      </div>

      {/* Body grid: left recent decks, center settings, right badges */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left rail: Recent Decks */}
        <section className="md:col-span-3 rounded-xl border border-neutral-800 p-4 space-y-3">
          <div className="text-lg font-semibold">Recent decks</div>
          <ul className="space-y-2 text-sm">
            {recentDecks.map(d => {
              // Build candidate keys and pick first matching art
              const candidates: string[] = [];
              if (d.commander) candidates.push(cleanName(String(d.commander)));
              if (d.title) candidates.push(cleanName(String(d.title)));
              const firstLine = String(d.deck_text||'').split(/\r?\n/).find(l=>!!l?.trim());
              if (firstLine) { const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(cleanName(m ? m[2] : firstLine)); }
              // include top cards for render fallback
              for (const n of (topCards[d.id] || []).slice(0,5)) candidates.push(cleanName(n));
              let img = '';
              for (const c of candidates) { const v = deckBg[norm(c)]; if (v) { img = v; break; } }
              return (
                <li key={d.id} className="relative z-0 rounded overflow-hidden border border-neutral-800">
                  <div className="relative">
                    {img && (<div className="h-24 bg-center bg-cover" style={{ backgroundImage: `url(${img})` }} />)}
                    {!img && (<div className="h-24 bg-neutral-900 skeleton-shimmer" />)}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1 flex items-center justify-between">
                      <a href={`/my-decks/${d.id}`} className="truncate hover:underline">{d.title}</a>
                      <div className="flex items-center gap-2">
                        <button onClick={async (e)=>{ e.preventDefault(); try { const r = await fetch(`/api/decks/${d.id}/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }) }); const j = await r.json().catch(()=>({})); if (r.ok && j?.ok) setLikes(prev=>({ ...prev, [d.id]: { count: j.count||0, liked: !!j.liked } })); } catch {} }} className={`text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200`}>❤ <span className={likes[d.id]?.liked ? 'text-red-400' : 'text-neutral-200'}>{likes[d.id]?.count ?? 0}</span></button>
                        <a href={`/decks/${d.id}`} className="text-xs opacity-90 hover:underline">View</a>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {recentDecks.length === 0 && (<li className="text-xs opacity-70">No recent decks.</li>)}
          </ul>
        </section>

        {/* Center column: Profile settings */}
        <div className="md:col-span-6 space-y-6">
          {/* Identity */}
          <section className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Identity</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="opacity-70 mb-1">Username</div>
                <input value={username} onChange={(e)=>setUsername(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" placeholder="Display name" />
              </label>
              <label className="text-sm">
                <div className="opacity-70 mb-1">Favorite Commander</div>
                <input value={favCommander} onChange={(e)=>setFavCommander(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" placeholder="Atraxa, Praetors' Voice" />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <label className="text-sm">
                <div className="opacity-70 mb-1">Signature deck</div>
                <select value={signatureDeckId} onChange={(e)=>setSignatureDeckId(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
                  <option value="">None</option>
                  {recentDecks.map(d => (<option key={d.id} value={d.id}>{d.title}</option>))}
                </select>
              </label>
              <div className="text-xs opacity-70 self-end">Shown as a banner overlay on your public profile.</div>
              <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={!!customCard?.show_on_banner} onChange={async(e)=>{ try{ const r = await fetch('/api/profile/custom-card', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ show_on_banner: e.target.checked }) }); const j = await r.json().catch(()=>({})); if (r.ok && j?.ok) setCustomCard(j.custom_card||{...(customCard||{}), show_on_banner: e.target.checked}); else throw new Error(j?.error||'Failed to update'); } catch{} }} /> Show custom card on my banner</label>
            </div>
            <div className="text-sm space-y-2">
              <div className="opacity-70">Commander avatars</div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {popularCommanderAvatars.length === 0 && (
                  <>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={`sk-${i}`} className="border rounded overflow-hidden border-neutral-700">
                        <div className="w-full h-16 animate-pulse bg-neutral-900" />
                      </div>
                    ))}
                  </>
                )}
                {popularCommanderAvatars.map((src, i) => (
                  <button key={`pc-${i}`} className={`border rounded overflow-hidden ${avatar===src?'border-emerald-500':'border-neutral-700'}`} onClick={()=>{ setAvatar(src); try{ capture('profile_avatar_change', { src, type:'commander' }); } catch{} }}>
                    <img src={src} alt="avatar" className="w-full h-16 object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm">
              <div className="opacity-70 mb-1">Color avatars</div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {AVATAR_FILES.map((src) => (
                  <button key={src} className={`border rounded overflow-hidden ${avatar===src?'border-emerald-500':'border-neutral-700'}`} onClick={()=>{ setAvatar(src); try{ capture('profile_avatar_change', { src, type:'color' }); } catch{} }}>
                    <img src={src} alt="avatar" className="w-full h-16 object-cover" onError={(e:any)=>{e.currentTarget.src='/next.svg';}} />
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm">
              <div className="opacity-70 mb-1">Favorite formats</div>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(f => {
                  const active = formats.includes(f);
                  const color: Record<string, string> = { Commander: 'bg-purple-700/40 border-purple-500', Modern: 'bg-blue-700/40 border-blue-500', Standard: 'bg-green-700/40 border-green-500', Pioneer: 'bg-amber-700/40 border-amber-500', Pauper: 'bg-slate-700/40 border-slate-500' };
                  return (
                    <button key={f} onClick={()=>setFormats(v=>toggle(v, f))} className={`px-3 py-1.5 rounded border text-xs ${active ? color[f] : 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}>{f}</button>
                  );
                })}
              </div>
            </div>
            <div className="text-sm">
              <div className="opacity-70 mb-1">Color pie alignment</div>
              <div className="flex flex-wrap gap-2">
                {COLOR_PIE.map(c => {
                  const active = colors.includes(c);
                  const mapBg: Record<string,string> = { W: 'bg-zinc-100 text-black border-zinc-300', U: 'bg-blue-600 text-white border-blue-400', B: 'bg-black text-white border-neutral-600', R: 'bg-red-600 text-white border-red-400', G: 'bg-green-600 text-white border-green-400' };
                  return (
                    <button key={c} onClick={()=>setColors(v=>toggle(v, c))} className={`px-3 py-1.5 rounded border text-sm ${active ? mapBg[c] : 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}>{c}</button>
                  );
                })}
              </div>
            </div>
            <div className="text-right">
              <button onClick={save} disabled={saving} className={`px-4 py-2 rounded ${saving?'bg-gray-300 text-black':'bg-white text-black hover:bg-gray-100'}`}>{saving? 'Saving…':'Save profile'}</button>
            </div>
          </section>

          {/* Security */}
          <section className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Security</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="text-sm">
                <div className="opacity-70 mb-1">Current password</div>
                <input type="password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" placeholder="••••••••" />
              </label>
              <label className="text-sm">
                <div className="opacity-70 mb-1">New password</div>
                <input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" placeholder="••••••••" />
              </label>
              <div className="flex items-end gap-2">
                <button onClick={changePassword} className="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm">Update</button>
                <button onClick={async()=>{ try{ await sb.auth.resetPasswordForEmail(userEmail, { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }); alert('Password reset email sent.'); }catch(e:any){ alert(e?.message || 'Failed to send reset email'); } }} className="text-xs underline opacity-80 hover:opacity-100">Forgot password?</button>
              </div>
            </div>
          </section>

          {/* Pins */}
          <section className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Pinned decks</div>
            <div className="text-xs opacity-80">Pick up to 3 decks to show on your public profile.</div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {recentDecks.map(d => {
                const checked = pinnedDeckIds.includes(d.id);
                const disabled = !checked && pinnedDeckIds.length >= 3;
                return (
                  <li key={d.id} className="flex items-center gap-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e)=>{
                        setPinnedDeckIds(prev => e.target.checked ? [...prev.filter(x=>x!==d.id), d.id] : prev.filter(x=>x!==d.id));
                      }} />
                      <span className="truncate">{d.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="text-right">
              <button onClick={async()=>{ try{ const r = await fetch('/api/profile/pins', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ pinned_deck_ids: pinnedDeckIds.slice(0,3) }) }); const j = await r.json().catch(()=>({})); if (!r.ok || j?.ok===false) throw new Error(j?.error||'Save failed'); alert('Pinned decks updated'); } catch(e:any){ alert(e?.message||'Save failed'); } }} className="px-3 py-2 rounded bg-white text-black text-sm">Save pins</button>
            </div>
          </section>

          {/* Activity */}
          <section className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Activity</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>Messages<div className="font-mono text-lg">{usage?.messages ?? 0}</div></div>
              <div>Decks<div className="font-mono text-lg">{deckCount}</div></div>
              <div>Collections<div className="font-mono text-lg">{collectionCount}</div></div>
            </div>
          </section>

          {/* Wishlist */}
          <section id="wishlist" className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Wishlist</div>
            <div className="flex items-center gap-2 text-sm">
              <input placeholder="Quick add card…" className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" onKeyDown={(e:any)=>{ if(e.key==='Enter'){ e.preventDefault(); const v=String(e.currentTarget.value||'').trim(); if(!v) return; setWishlist((prev)=> (prev? prev+"\n" : "") + v); e.currentTarget.value=''; } }} />
              <button onClick={(e)=>{ const inp=(e.currentTarget.previousSibling as HTMLInputElement); const v=String(inp?.value||'').trim(); if(!v) return; setWishlist((prev)=> (prev? prev+"\n" : "") + v); try{ inp.value=''; }catch{} }} className="px-3 py-1.5 rounded border border-neutral-700">Add</button>
            </div>
            <div className="text-xs opacity-80">Paste one card name per line. This integrates later with Cost-to-Finish.</div>
            <textarea value={wishlist} onChange={(e)=>setWishlist(e.target.value)} className="w-full h-40 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" placeholder={"Sol Ring\nCyclonic Rift"} />
            <div className="text-right">
              <button onClick={save} disabled={saving} className={`px-4 py-2 rounded ${saving?'bg-gray-300 text-black':'bg-white text-black hover:bg-gray-100'}`}>Save wishlist</button>
            </div>
          </section>

          {/* Share */}
          <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
            <div className="text-lg font-semibold">Share</div>
            <div className="text-sm opacity-80">Click to generate a public link to show off your decks and badges.</div>
            <div className="flex items-center gap-2">
              <button onClick={async () => { try { const r = await fetch('/api/profile/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_public: true }) }); const j = await r.json().catch(()=>({})); if (r.ok && j?.ok) { navigator.clipboard?.writeText?.(j.url); alert('Share link copied to clipboard'); } else { alert(j?.error || 'Share failed'); } } catch (e:any) { alert(e?.message || 'Share failed'); } }} className="px-3 py-2 rounded bg-white text-black text-sm">Share my profile</button>
              <button onClick={async () => { try { const r = await fetch('/api/profile/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_public: false }) }); const j = await r.json().catch(()=>({})); if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Unshare failed'); alert('Profile set to private'); } catch (e:any) { alert(e?.message || 'Unshare failed'); } }} className="px-3 py-2 rounded bg-neutral-800 text-neutral-200 text-sm">Disable sharing</button>
            </div>
          </section>
        </div>

        {/* Right rail: Badges */}
        <aside className="md:col-span-3 space-y-6">
          <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="text-lg font-semibold">Badges</div>
            {badges.length === 0 && (<div className="text-xs opacity-70">No badges yet.</div>)}
            <ul className="space-y-2">
              {[...badges, ...extraBadges].map(b => (
                <li key={b.key} title={b.desc} className="rounded-lg overflow-hidden border border-neutral-700 bg-gradient-to-r from-neutral-900 to-neutral-800">
                  <div className="p-3 flex items-center gap-3">
                    <div className="text-xl">{b.emoji}</div>
                    <div>
                      <div className="font-semibold text-sm">{b.label}</div>
                      <div className="text-xs opacity-80">{b.desc}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <NextBadgesProgress deckCount={deckCount} collectionCount={collectionCount} pinnedCount={pinnedDeckIds.length} signatureSet={!!signatureDeckId} likesMap={likes} />
            <ToolUsageMini tools={tools} />
          </div>

          {/* Stats charts under badges */}
          <StatsCharts sb={sb} userEmail={userEmail} />

          {/* Stats charts under badges */}
          <StatsCharts sb={sb} userEmail={userEmail} />
        </aside>
      </div>
    </div>
  );
}

function NextBadgesProgress({ deckCount, collectionCount, pinnedCount, signatureSet, likesMap }: { deckCount:number; collectionCount:number; pinnedCount:number; signatureSet:boolean; likesMap: Record<string, {count:number; liked:boolean}> }){
  function nextTarget(thresholds:number[], val:number){ for (const t of thresholds){ if (val < t) return t; } return null; }
  const items: Array<{ key:string; label:string; current:number; target:number; emoji:string }> = [];
  const tBrewer = nextTarget([5,15,30], deckCount); if (tBrewer!=null) items.push({ key:'brewer_next', label:`Brewer ${tBrewer===5?'I':tBrewer===15?'II':'III'}`, current: deckCount, target: tBrewer, emoji:'⚗️' });
  const tCurator = nextTarget([3,10,25], collectionCount); if (tCurator!=null) items.push({ key:'curator_next', label:`Curator ${tCurator===3?'I':tCurator===10?'II':'III'}`, current: collectionCount, target: tCurator, emoji:'📚' });
  if (!signatureSet) items.push({ key:'signature', label:'Signature Commander', current: 0, target: 1, emoji:'👑' });
  if (pinnedCount < 3) items.push({ key:'showcase', label:'Showcase (pin 3 decks)', current: pinnedCount, target: 3, emoji:'📌' });
  // Likes-based progress (approx using recent decks only)
  const maxLikes = Object.values(likesMap||{}).reduce((m,v)=> Math.max(m, Number(v?.count||0)), 0);
  if (maxLikes < 10) items.push({ key:'apprentice_teacher', label:'Apprentice Teacher (10 likes on a deck)', current: maxLikes, target: 10, emoji:'🥇' });
  else if (maxLikes < 25) items.push({ key:'master_teacher', label:'Master Teacher (25 likes on a deck)', current: maxLikes, target: 25, emoji:'🎖️' });

  if (items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="text-sm font-medium">Progress toward next badges</div>
      <ul className="space-y-2">
        {items.map(it => {
          const pct = Math.max(0, Math.min(100, Math.round((it.current/Math.max(1,it.target))*100)));
          const reqMap: any = {
            brewer_next: 'Build more decks to reach the next Brewer tier.',
            curator_next: 'Maintain more collections to reach the next Curator tier.',
            signature: 'Pick a signature deck to unlock this badge.',
            showcase: 'Pin 3 decks on your public profile.',
            apprentice_teacher: 'Reach 10 likes on any single deck.',
            master_teacher: 'Reach 25 likes on any single deck.',
          };
          const title = reqMap[it.key] || `${it.current}/${it.target} progress`;
          return (
            <li key={it.key} className="text-xs" title={title}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-base">{it.emoji}</span><span>{it.label}</span></div>
                <div className="font-mono">{it.current}/{it.target}</div>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-neutral-800 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: pct+"%" }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="text-[10px] opacity-60">More badges coming soon. Progress bars estimate using your recent activity.</div>
    </div>
  );
}

function ToolUsageMini({ tools }: { tools: { prob_runs?:number; prob_saves?:number; mull_iters_total?:number } }){
  const runs = tools?.prob_runs||0; const saves = tools?.prob_saves||0; const iters = tools?.mull_iters_total||0;
  const needRuns = Math.max(0, 10 - runs);
  const needSaves = Math.max(0, 5 - saves);
  const needIters = Math.max(0, 25000 - iters);
  return (
    <div className="mt-3 rounded border border-neutral-800 p-2 text-[11px]">
      <div className="font-medium mb-1">Tool usage</div>
      <ul className="grid grid-cols-1 gap-1">
        <li title="Run Probability tool 10 times to unlock Mathlete">Mathlete ∑ — runs: <span className="font-mono">{runs}</span>{needRuns>0?` (need ${needRuns} more)`:''}</li>
        <li title="Save 5 scenarios to unlock Scenario Collector">Scenario Collector 💾 — saves: <span className="font-mono">{saves}</span>{needSaves>0?` (need ${needSaves} more)`:''}</li>
        <li title="Accumulate 25,000 mulligan iterations to unlock Mulligan Master">Mulligan Master ♻️ — iterations: <span className="font-mono">{iters}</span>{needIters>0?` (need ${needIters} more)`:''}</li>
      </ul>
    </div>
  );
}

// Lightweight charts: playstyle radar and color pie
function StatsCharts({ sb, userEmail }: { sb: any; userEmail: string }) {
  const [cmdrs, setCmdrs] = useState<string[]>([]);
  const [colorCounts, setColorCounts] = useState<Record<string, number>>({ W:0,U:0,B:0,R:0,G:0 });
  const [radar, setRadar] = useState<Record<string, number>>({ aggro:0, control:0, combo:0, midrange:0, stax:0 });

  useEffect(() => {
    (async () => {
      try {
        const { data: ures } = await sb.auth.getUser();
        const u = ures?.user; if (!u) return;
        // Pull user's decks (ids, commanders, titles)
        const { data: decks } = await sb.from('decks').select('id, commander, title').eq('user_id', u.id).limit(30);
        const list = Array.isArray(decks) ? decks as any[] : [];
        const namePool = list.flatMap(x=>[String(x.commander||''), String(x.title||'')]).filter(Boolean);
        setCmdrs(namePool);

        // Color pie by commander/title
        if (namePool.length) {
          const identifiers = Array.from(new Set(namePool)).map(n=>({ name: n }));
          const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
          const j:any = await r.json().catch(()=>({}));
          const rows:any[] = Array.isArray(j?.data) ? j.data : [];
          const sum: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
          for (const row of rows) {
            const ci: string[] = Array.isArray(row?.color_identity) ? row.color_identity : [];
            for (const c of ci) sum[c] = (sum[c]||0) + 1;
          }
          setColorCounts(sum);
        } else {
          setColorCounts({W:0,U:0,B:0,R:0,G:0});
        }

        // Archetype radar: analyze deck_cards and Scryfall keywords
        const cardsByDeck = new Map<string, { name: string; qty: number }[]>();
        const uniqueNames = new Set<string>();
        await Promise.all(list.map(async d => {
          const { data } = await sb.from('deck_cards').select('name, qty').eq('deck_id', d.id).limit(200);
          const rows = Array.isArray(data) ? (data as any[]) : [];
          const arr = rows.map(x => ({ name: String(x.name), qty: Number(x.qty||1) }));
          cardsByDeck.set(d.id, arr);
          for (const r of arr) uniqueNames.add(r.name);
        }));

        // Limit unique names to 300 to be gentle
        const idents = Array.from(uniqueNames).slice(0,300).map(n=>({ name: n }));
        const scry: Record<string, any> = {};
        if (idents.length) {
          const rr = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers: idents }) });
          const jj:any = await rr.json().catch(()=>({}));
          const data:any[] = Array.isArray(jj?.data) ? jj.data : [];
          for (const c of data) {
            const key = String(c?.name||'').toLowerCase();
            scry[key] = c;
          }
        }

        function info(n: string) {
          const k = String(n||'').toLowerCase();
          return scry[k] || null;
        }

        const radarAgg = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
        for (const [deckId, arr] of cardsByDeck.entries()) {
          const w = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
          for (const { name, qty } of arr) {
            const card = info(name);
            const type = String(card?.type_line||'');
            const text = String(card?.oracle_text||'').toLowerCase();
            const cmc = Number(card?.cmc||0);
            const q = Math.min(Math.max(qty||1,1),4);
            if (type.includes('Creature')) { w.aggro += 0.5*q; w.midrange += 0.2*q; }
            if (type.includes('Instant') || type.includes('Sorcery')) { w.control += 0.2*q; w.combo += 0.1*q; }
            if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { w.control += 0.6*q; }
            if (/search your library/.test(text) || /tutor/.test(text)) { w.combo += 0.6*q; }
            if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
               || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) {
              w.stax += 0.8*q;
            }
            if (cmc <= 2 && type.includes('Creature')) { w.aggro += 0.2*q; }
            if (cmc >= 5 && type.includes('Creature')) { w.midrange += 0.2*q; }
          }
          radarAgg.aggro += w.aggro;
          radarAgg.control += w.control;
          radarAgg.combo += w.combo;
          radarAgg.midrange += w.midrange;
          radarAgg.stax += w.stax;
        }
        setRadar(radarAgg);
      } catch {}
    })();
  }, [sb, userEmail]);

  // pie chart paths
  const total = Object.values(colorCounts).reduce((a,b)=>a+b,0) || 1;
  function Pie() {
    let start = -Math.PI/2;
    const R = 42, CX=50, CY=50;
    const colors: Record<string,string> = { W:'#e5e7eb', U:'#60a5fa', B:'#64748b', R:'#f87171', G:'#34d399' };
    const segs: any[] = [];
    for (const k of ['W','U','B','R','G'] as const) {
      const frac = (colorCounts[k]||0)/total;
      const end = start + 2*Math.PI*frac;
      const x1 = CX + R*Math.cos(start), y1 = CY + R*Math.sin(start);
      const x2 = CX + R*Math.cos(end),   y2 = CY + R*Math.sin(end);
      const large = (end-start) > Math.PI ? 1 : 0;
      const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
      segs.push(<path key={k} d={d} fill={colors[k]} stroke="#111" strokeWidth="0.5" />);
      start = end;
    }
    return <svg viewBox="0 0 100 100" className="w-28 h-28">{segs}</svg>;
  }

  function Radar() {
    const keys = ['aggro','control','combo','midrange','stax'] as const;
    const max = Math.max(1, ...keys.map(k=>radar[k]));
    const R = 42, CX=60, CY=60;
    const points: string[] = [];
    keys.forEach((k, i) => {
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const val = (radar[k]/max) * R;
      const x = CX + val*Math.cos(ang);
      const y = CY + val*Math.sin(ang);
      points.push(`${x},${y}`);
    });
    const axes = keys.map((k,i)=>{
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const x = CX + R*Math.cos(ang);
      const y = CY + R*Math.sin(ang);
      return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="#333" strokeWidth="0.5" />;
    });
    const labels = keys.map((k,i)=>{
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const x = CX + (R+10)*Math.cos(ang);
      const y = CY + (R+10)*Math.sin(ang);
      return <text key={`lbl-${k}`} x={x} y={y} fontSize="8" textAnchor="middle" fill="#9ca3af">{k}</text>;
    });
    return (
      <svg viewBox="0 0 140 140" className="w-36 h-36">
        <g transform="translate(10,10)">
          <circle cx={60} cy={60} r={42} fill="none" stroke="#333" strokeWidth="0.5" />
          {axes}
          <polygon points={points.join(' ')} fill="rgba(56,189,248,0.35)" stroke="#22d3ee" strokeWidth="1" />
          {labels}
        </g>
      </svg>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-800 p-4">
      <div className="text-lg font-semibold mb-2">Your deck trends</div>
      <div className="flex flex-col items-center">
        <div className="flex flex-col items-center">
          <div className="text-xs opacity-80 mb-1">Color balance</div>
          <Pie />
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
            {['W','U','B','R','G'].map(k => (
              <div key={`leg-${k}`}>{k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green'}: {colorCounts[k as 'W'|'U'|'B'|'R'|'G']||0}</div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center w-full">
          <div className="text-xs opacity-80 mb-1">Playstyle radar</div>
          <div className="w-full flex justify-center"><Radar /></div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
            {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (<div key={t}>{t}</div>))}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-neutral-400">Derived from your decklists: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces) and aggregate across your decks.</div>
    </section>
  );
}
