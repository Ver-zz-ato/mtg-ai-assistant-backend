"use client";
import React from "react";
import { ELI5, HelpTip } from "@/components/AdminHelp";

export default function AdminEventsPage(){
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string|null>(null);
  const [data, setData] = React.useState<any>(null);

  async function load(){
    setLoading(true); setErr(null);
    try{
      const r = await fetch('/api/admin/events/summary', { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      setData(j);
    }catch(e:any){ setErr(e?.message||'load failed'); }
    finally{ setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  const totals = data?.totals||{};
  const badges = data?.badges||{};
  const top = data?.top||{};

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-3">
      <div className="text-xl font-semibold">Events Debug</div>
      <ELI5 heading="Events" items={["Totals for key tools (probability, mulligan).", "Who ran the most, who iterated most. Quick health check of usage."]} />
      {err && <div className="text-xs text-red-400">{err}</div>}

      <section className="rounded border border-neutral-800 p-3">
        <div className="font-medium mb-2">Totals</div>
        <ul className="text-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Probability runs<div className="font-mono text-lg">{totals.totalProbRuns||0}</div></li>
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Probability saves<div className="font-mono text-lg">{totals.totalProbSaves||0}</div></li>
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Mulligan iterations<div className="font-mono text-lg">{totals.totalMullIters||0}</div></li>
        </ul>
      </section>

      <section className="rounded border border-neutral-800 p-3">
        <div className="font-medium mb-2">Badge counts</div>
        <ul className="text-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Mathlete ≥10 runs<div className="font-mono text-lg">{badges.mathlete||0}</div></li>
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Scenario Collector ≥5 saves<div className="font-mono text-lg">{badges.scenario||0}</div></li>
          <li className="rounded bg-neutral-900 border border-neutral-800 p-2">Mulligan Master ≥25k<div className="font-mono text-lg">{badges.mullMaster||0}</div></li>
        </ul>
      </section>

      <section className="rounded border border-neutral-800 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="font-medium mb-2">Top Probability runs</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 px-2">User</th><th className="text-right py-1 px-2">Runs</th></tr></thead>
            <tbody>
              {(top.runs||[]).map((r:any)=> (
                <tr key={r.id} className="border-b border-neutral-900"><td className="py-1 px-2">{r.email||r.id}</td><td className="py-1 px-2 text-right font-mono">{r.runs}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="font-medium mb-2">Top Mulligan iterations</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 px-2">User</th><th className="text-right py-1 px-2">Iterations</th></tr></thead>
            <tbody>
              {(top.iters||[]).map((r:any)=> (
                <tr key={r.id} className="border-b border-neutral-900"><td className="py-1 px-2">{r.email||r.id}</td><td className="py-1 px-2 text-right font-mono">{r.iters}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-right"><button onClick={load} disabled={loading} className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">{loading?'Refreshing…':'Refresh'}</button></div>
    </main>
  );
}
