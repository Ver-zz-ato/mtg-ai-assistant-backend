'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key:string, value:any){ const r=await fetch('/api/admin/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,value})}); const j=await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'save_failed'); }

export default function DeployPage(){
  const [version, setVersion] = React.useState<any>({ sha:'', model:'', region:'', deployed_at:'' });
  const [perf, setPerf] = React.useState<any>({ ttfb_ms: null, api_p95_ms: null, img_load_ms: null });

  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/admin/config?key=version_info&key=perf_budgets', {cache:'no-store'}); const j=await r.json(); if(j?.config?.version_info) setVersion(j.config.version_info); if(j?.config?.perf_budgets) setPerf(j.config.perf_budgets);} catch{} })(); },[]);

  async function saveVersion(){ try{ await saveConfig('version_info', version); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function savePerf(){ try{ await saveConfig('perf_budgets', perf); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Deployment Awareness</div>
      <ELI5 heading="Deployment Awareness" items={[
        'Version & Env: Record what\'s live — git SHA, AI model, region, deploy time. When something breaks, you know exactly which version to blame.',
        'Perf Budgets: Set targets (TTFB, API p95, image load). Not enforced — just a reminder. If metrics creep past these, investigate.'
      ]} />

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Version & Env Panel <HelpTip text="A quick human note of what we deployed and where. No magic here—just a convenient record." /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <label>Git SHA<input value={version.sha||''} onChange={e=>setVersion((p:any)=>({...p, sha:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
          <label>Model<input value={version.model||''} onChange={e=>setVersion((p:any)=>({...p, model:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
          <label>Region<input value={version.region||''} onChange={e=>setVersion((p:any)=>({...p, region:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
          <label>Deployed at<input type="datetime-local" value={version.deployed_at||''} onChange={e=>setVersion((p:any)=>({...p, deployed_at:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
        </div>
        <button onClick={saveVersion} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Perf Budgets <HelpTip text="Targets to keep pages snappy. Not hard limits, but a good reminder." /></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <label>TTFB target (ms)<input type="number" value={perf.ttfb_ms||''} onChange={e=>setPerf((p:any)=>({...p, ttfb_ms:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>API p95 (ms)<input type="number" value={perf.api_p95_ms||''} onChange={e=>setPerf((p:any)=>({...p, api_p95_ms:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>Image load (ms)<input type="number" value={perf.img_load_ms||''} onChange={e=>setPerf((p:any)=>({...p, img_load_ms:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
        </div>
        <button onClick={savePerf} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>
    </div>
  );
}
