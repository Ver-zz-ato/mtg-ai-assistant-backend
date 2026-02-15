"use client";
import React from "react";
import { ELI5, HelpTip } from "@/components/AdminHelp";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AdminBadgesPage(){
  const sb = React.useMemo(()=>createBrowserSupabaseClient(),[]);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<Array<{ key:string; label:string; count:number }>>([]);
  const [error, setError] = React.useState<string|null>(null);

  async function load(){
    setLoading(true); setError(null);
    try{
      // Approximate counts from recent public decks (lightweight first pass)
      const { data: decks } = await sb.from('decks').select('id,user_id,deck_text,is_public').order('created_at',{ascending:false}).limit(200);
      const list = Array.isArray(decks)? decks as any[] : [];
      const byUser: Record<string, any[]> = {};
      list.forEach(d=>{ const u=d.user_id||'anon'; (byUser[u]=byUser[u]||[]).push(d); });
      const brewer5 = Object.values(byUser).filter(arr=>arr.length>=5).length;
      const brewer15 = Object.values(byUser).filter(arr=>arr.length>=15).length;
      const brewer30 = Object.values(byUser).filter(arr=>arr.length>=30).length;

      // Rough combo badge: users with at least one deck hitting a combo (sample up to 1 deck per user)
      let combomancers=0; let oncurve=0; let maestro=0;
      async function analyzeOne(d:any){
        try{
          const dr = await fetch('/api/deck/combos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ deckId: d.id })});
          const dj = await dr.json().catch(()=>({}));
          if (Array.isArray(dj?.present) && dj.present.length>0) return { combo:true };
        } catch{}
        return { combo:false };
      }
      const users = Object.entries(byUser).slice(0,100); // sample
      for (const [uid, arr] of users){
        const d = (arr as any[])[0];
        const r = await analyzeOne(d);
        if (r.combo) combomancers++;
        // Optional: on-curve/maestro skipped here for cost; left at 0 until we add a job
      }

      setRows([
        { key:'brewer_i', label:'Brewer I (≥5 decks)', count: brewer5 },
        { key:'brewer_ii', label:'Brewer II (≥15 decks)', count: brewer15 },
        { key:'brewer_iii', label:'Brewer III (≥30 decks)', count: brewer30 },
        { key:'combomancer', label:'Combomancer (combo present)', count: combomancers },
        { key:'on_curve_90', label:'On-Curve 90 (est.)', count: oncurve },
        { key:'mana_maestro', label:'Mana Maestro (est.)', count: maestro },
      ]);
    } catch(e:any){ setError(e?.message||'load failed'); }
    finally{ setLoading(false); }
  }

  React.useEffect(()=>{ load(); },[]);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="text-xl font-semibold">Badges summary (approx)</div>
      <ELI5 heading="Badges" items={[
        "Approximate counts from a sample of recent public decks (last 200). Not exact — some badges (On-Curve, Mana Maestro) are placeholders.",
        "For exact counts, add a background job that scans all decks. Use this for a quick sense check."
      ]} />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 px-2">Badge</th><th className="text-right py-1 px-2">Users</th></tr></thead>
          <tbody>
            {rows.map(r=> (
              <tr key={r.key} className="border-b border-neutral-900"><td className="py-1 px-2">{r.label}</td><td className="py-1 px-2 text-right font-mono">{r.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-right"><button onClick={load} disabled={loading} className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">{loading?'Refreshing…':'Refresh'}</button></div>
    </main>
  );
}
