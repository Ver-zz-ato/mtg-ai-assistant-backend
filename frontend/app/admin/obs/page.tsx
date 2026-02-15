'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function ObsPage(){
  const [audit, setAudit] = React.useState<any[]>([]);
  const [rl, setRl] = React.useState<any>(null);
  const [errors, setErrors] = React.useState<any[]>([]);

  React.useEffect(()=>{ (async()=>{ try { const r = await fetch('/api/admin/audit'); const j = await r.json(); if (j?.ok) setAudit(j.rows||[]);} catch{}; try { const r2 = await fetch('/api/admin/rate-limits?hours=24'); const j2 = await r2.json(); if (j2?.ok) setRl(j2);} catch{}; try { const r3 = await fetch('/api/admin/errors?limit=200'); const j3 = await r3.json(); if (j3?.ok) setErrors(j3.rows||[]);} catch{} })(); }, []);

  const refresh = () => {
    (async () => {
      try { const r = await fetch('/api/admin/audit'); const j = await r.json(); if (j?.ok) setAudit(j.rows || []); } catch {}
      try { const r2 = await fetch('/api/admin/rate-limits?hours=24'); const j2 = await r2.json(); if (j2?.ok) setRl(j2); } catch {}
      try { const r3 = await fetch('/api/admin/errors?limit=200'); const j3 = await r3.json(); if (j3?.ok) setErrors(j3.rows || []); } catch {}
    })();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Observability</div>
        <button onClick={refresh} className="text-sm px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Refresh</button>
      </div>
      <ELI5 heading="Observability" items={[
        'Event Stream: Who did what, when. Confirms actions (deck save, login, etc.) actually happened.',
        'Rate Limits: Who is hitting 429s? Top users and IPs in the last 24h. Helps spot abuse or bugs.',
        'Error Logs: Latest server errors for quick triage. Not a long-term log store — use your logging service for that.'
      ]} />

      {/* Live-ish audit (latest 200) */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Event Stream (latest 200) <HelpTip text="High-level actions with who/when/what. Useful to confirm a thing happened." /></div>
        <div className="overflow-auto max-h-80">
          <table className="min-w-full text-sm">
            <thead><tr><th className="text-left py-1 px-2">When</th><th className="text-left py-1 px-2">Actor</th><th className="text-left py-1 px-2">Action</th><th className="text-left py-1 px-2">Target</th></tr></thead>
            <tbody>
              {audit.map((r:any,i:number)=> (<tr key={i} className="border-t border-neutral-900"><td className="py-1 px-2 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td><td className="py-1 px-2 font-mono text-xs">{r.actor_id}</td><td className="py-1 px-2">{r.action}</td><td className="py-1 px-2 break-all">{String(r.target||'')}</td></tr>))}
              {audit.length===0 && (<tr><td colSpan={4} className="py-3 text-center opacity-70">No audit rows</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rate limits */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Rate Limit & 429s Dashboard <HelpTip text="Who is hammering us? Shows the heaviest users/IPs in the past day." /></div>
        <p className="text-xs text-neutral-500">ELI5: When someone gets too many requests too fast, we return 429. This list shows who hit that limit most — helps spot bots, bugs, or users who need higher limits.</p>
        {!rl ? (<div className="text-sm opacity-70">Loading…</div>) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm opacity-80 mb-1">Top Users (24h)</div>
              <ul className="text-sm space-y-1 max-h-60 overflow-auto">
                {(rl.topUsers||[]).map((x:any)=> (<li key={x.user_id} className="flex justify-between"><span className="font-mono text-xs">{x.user_id}</span><span>{x.count}</span></li>))}
              </ul>
            </div>
            <div>
              <div className="text-sm opacity-80 mb-1">Top IPs (24h)</div>
              <ul className="text-sm space-y-1 max-h-60 overflow-auto">
                {(rl.topIps||[]).map((x:any)=> (<li key={x.ip_hash} className="flex justify-between"><span className="font-mono text-xs">{x.ip_hash}</span><span>{x.count}</span></li>))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Error Logs */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Error Logs (latest 200) <HelpTip text="Quick triage list. Use for clues, not as the long‑term log store." /></div>
        <p className="text-xs text-neutral-500">ELI5: Server errors we logged. Check path + message to debug. For full history, use Vercel logs or your logging service.</p>
        <div className="overflow-auto max-h-80">
          <table className="min-w-full text-sm">
            <thead><tr><th className="text-left py-1 px-2">When</th><th className="text-left py-1 px-2">Kind</th><th className="text-left py-1 px-2">Message</th><th className="text-left py-1 px-2">Path</th></tr></thead>
            <tbody>
              {errors.map((e:any,i:number)=>(
                <tr key={i} className="border-t border-neutral-900"><td className="py-1 px-2 font-mono text-xs">{new Date(e.created_at).toLocaleString()}</td><td className="py-1 px-2">{e.kind}</td><td className="py-1 px-2 break-all">{e.message}</td><td className="py-1 px-2 break-all">{e.path}</td></tr>
              ))}
              {errors.length===0 && (<tr><td colSpan={4} className="py-3 text-center opacity-70">No errors</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {/* Placeholders */}
      <section className="rounded border border-neutral-800 p-3">
        <div className="font-medium">RLS Probe</div>
        <div className="text-sm opacity-70">Coming soon — add probe queries.</div>
      </section>
    </div>
  );
}
