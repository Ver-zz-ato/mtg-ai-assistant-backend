'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key:string, value:any){ const r = await fetch('/api/admin/config', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key, value })}); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'save_failed'); }

export default function SecurityPage(){
  const [audit, setAudit] = React.useState<any[]>([]);
  const [csp, setCsp] = React.useState<any>({ hosts: { img:['https://cards.scryfall.io'], script:['https://js.stripe.com','https://storage.ko-fi.com'] } });
  const [keys, setKeys] = React.useState<any>({ openai_last_rotated: null, supabase_last_rotated: null });

  React.useEffect(()=>{ (async()=>{ try { const r=await fetch('/api/admin/audit'); const j=await r.json(); if(j?.ok) setAudit(j.rows||[]);} catch{}; try{ const r2=await fetch('/api/admin/config?key=csp_hosts&key=key_rotation'); const j2=await r2.json(); if(j2?.config?.csp_hosts) setCsp(j2.config.csp_hosts); if(j2?.config?.key_rotation) setKeys(j2.config.key_rotation);} catch{} })(); },[]);

  async function saveCsp(){ try{ await saveConfig('csp_hosts', csp); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function saveKeys(){ try{ await saveConfig('key_rotation', keys); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Security & Compliance</div>
      <ELI5 heading="Security & Compliance" items={[
        '🔒 Audit Log: See recent admin actions for accountability and troubleshooting',
        '🛡️ CSP (Content Security Policy): Control which external domains can load images/scripts',
        '⚠️ Failed Auth Attempts: Spot suspicious login attempts or brute force attacks',
        '📊 Rate Limit Monitoring: Track API abuse or bot traffic',
        '🔍 Security Events: Unusual activity, blocked requests, potential threats',
        '⏱️ When to use: Weekly security spot-checks, investigating abuse reports',
        '🔄 How often: Weekly reviews, or immediately after suspicious activity',
        '💡 Helps catch: Compromised accounts, API abuse, scraping bots, DDoS attempts',
        'Track when sensitive keys were last rotated.'
      ]} />

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Admin Audit Log (latest 200) <HelpTip text="Who did what and when. Pulls the last 200 admin actions." /></div>
        <div className="overflow-auto max-h-80">
          <table className="min-w-full text-sm"><thead><tr><th className="text-left py-1 px-2">When</th><th className="text-left py-1 px-2">Actor</th><th className="text-left py-1 px-2">Action</th><th className="text-left py-1 px-2">Target</th></tr></thead><tbody>
            {audit.map((r:any,i:number)=> (<tr key={i} className="border-t border-neutral-900"><td className="py-1 px-2 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td><td className="py-1 px-2 font-mono text-xs">{r.actor_id}</td><td className="py-1 px-2">{r.action}</td><td className="py-1 px-2 break-all">{String(r.target||'')}</td></tr>))}
            {audit.length===0 && <tr><td colSpan={4} className="py-3 text-center opacity-70">No audit rows</td></tr>}
          </tbody></table>
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">CSP Tester + Allowed Hosts <HelpTip text="Whitelists for images/scripts. Changes apply in report‑only mode first." /></div>
        <div className="text-sm opacity-80">Edit allowed hosts (report‑only CSP is active). Use with care.</div>
        <textarea value={JSON.stringify(csp, null, 2)} onChange={e=>{ try{ setCsp(JSON.parse(e.target.value)); } catch { /* ignore live parse */ } }} className="w-full h-40 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono"/>
        <button onClick={saveCsp} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save Hosts</button>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Key Rotation Health <HelpTip text="Jot down the last rotation time for critical keys so we don\'t forget." /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <label>OpenAI last rotated<input type="datetime-local" value={keys.openai_last_rotated||''} onChange={e=>setKeys((p:any)=>({...p, openai_last_rotated: e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>Supabase last rotated<input type="datetime-local" value={keys.supabase_last_rotated||''} onChange={e=>setKeys((p:any)=>({...p, supabase_last_rotated: e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
        </div>
        <button onClick={saveKeys} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>
    </div>
  );
}
