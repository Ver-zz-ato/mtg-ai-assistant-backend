"use client";
import React from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function RecentDecksStrip() {
  const [items, setItems] = React.useState<Array<{ id: string; title: string; commander?: string; art?: string }>>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id; if (!uid) return;
        const { data } = await sb.from('decks').select('id,title,deck_text').eq('user_id', uid).order('created_at', { ascending: false }).limit(6);
        const list = (data as any[] || []).map(d => {
          const first = String(d?.deck_text || '').split(/\r?\n/).find((l:string)=>!!l?.trim()) || d?.title || '';
          // Try extracting commander name from a "1 Name" line
          const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
          const commander = (m ? m[2] : first).replace(/\s*\(.*?\)\s*$/, '').trim();
          return { id: d.id, title: d.title, commander };
        });
        // Fetch art images
        try {
          const names = Array.from(new Set(list.map(x=>x.commander).filter(Boolean)));
          const { getImagesForNames } = await import("@/lib/scryfall");
          const m = await getImagesForNames(names as string[]);
          const withArt = list.map(x => { const key = String(x.commander||'').toLowerCase(); const info = m.get(key); return { ...x, art: info?.art_crop || info?.normal || info?.small }; });
          if (alive) setItems(withArt);
        } catch { if (alive) setItems(list as any); }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  if (!items.length) return null;

  return (
    <div className="w-full mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(it => (
          <a key={it.id} href={`/decks/${it.id}`} className="relative rounded-xl overflow-hidden border border-neutral-800 group">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: it.art ? `url(${it.art})` : undefined }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="relative p-3">
              <div className="text-sm font-semibold text-white drop-shadow">{it.title}</div>
              {it.commander && (<div className="text-xs opacity-80 text-white drop-shadow">{it.commander}</div>)}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
