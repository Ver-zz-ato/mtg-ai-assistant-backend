'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key:string, value:any){ const r = await fetch('/api/admin/config',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key, value })}); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'save_failed'); }

export default function ChatLeversPage(){
  const [defaults, setDefaults] = React.useState<any>({ format:'Commander', budget_cap: 0, power: 'mid' });
  const [packs, setPacks] = React.useState<any>({ fast_swaps:true, combo_checks:true, rules_snippet:true });
  const [rules, setRules] = React.useState<any>({ prefer:['Comprehensive Rules'] });
  const [policy, setPolicy] = React.useState<any>({ model_per_route: { chat:'gpt-4o-mini' }, max_cost_usd: 1.0 });

  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/admin/config?key=chat_defaults&key=answer_packs&key=rules_sources&key=model_policy',{cache:'no-store'}); const j=await r.json(); if(j?.config?.chat_defaults) setDefaults(j.config.chat_defaults); if(j?.config?.answer_packs) setPacks(j.config.answer_packs); if(j?.config?.rules_sources) setRules(j.config.rules_sources); if(j?.config?.model_policy) setPolicy(j.config.model_policy);} catch{} })(); },[]);

  async function saveDefaults(){ try{ await saveConfig('chat_defaults', defaults); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function savePacks(){ try{ await saveConfig('answer_packs', packs); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function saveRules(){ try{ await saveConfig('rules_sources', rules); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function savePolicy(){ try{ await saveConfig('model_policy', policy); alert('Saved'); } catch(e:any){ alert(e?.message||'failed'); } }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Chat Levers</div>
      <ELI5 heading="Chat Levers" items={[
        'Set friendly defaults the assistant assumes (format, budget, power level).',
        'Toggle helper packs that add common answers (swaps, combos, rules).',
        'Tune which rules sources are preferred and which model/cost policy to use.'
      ]} />

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Default Assumptions Editor <HelpTip text="What the assistant assumes if the user doesn\'t specify: format, budget cap, power." /></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <label>Format<input value={defaults.format||''} onChange={e=>setDefaults((p:any)=>({...p, format:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>Budget cap<input type="number" value={defaults.budget_cap||0} onChange={e=>setDefaults((p:any)=>({...p, budget_cap:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>Power<input value={defaults.power||''} onChange={e=>setDefaults((p:any)=>({...p, power:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
        </div>
        <button onClick={saveDefaults} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Answer Packs Switchboard <HelpTip text="Quick toggles for prebuilt answer modules. No deploy needed." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.fast_swaps} onChange={e=>setPacks((p:any)=>({...p, fast_swaps:e.target.checked}))}/> Fast Swaps</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.combo_checks} onChange={e=>setPacks((p:any)=>({...p, combo_checks:e.target.checked}))}/> Combo checks</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.rules_snippet} onChange={e=>setPacks((p:any)=>({...p, rules_snippet:e.target.checked}))}/> Rules snippet</label>
        </div>
        <button onClick={savePacks} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Rules Source Tuning <HelpTip text="Pick preferred rules sources; order matters when building snippets." /></div>
        <textarea value={JSON.stringify(rules, null, 2)} onChange={e=>{ try{ setRules(JSON.parse(e.target.value)); } catch{} }} className="w-full h-32 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono"/>
        <button onClick={saveRules} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Model & Cost Policy <HelpTip text="Map routes to models and set per‑request ceilings so we stay within budget." /></div>
        <textarea value={JSON.stringify(policy, null, 2)} onChange={e=>{ try{ setPolicy(JSON.parse(e.target.value)); } catch{} }} className="w-full h-32 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono"/>
        <button onClick={savePolicy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
      </section>
    </div>
  );
}
