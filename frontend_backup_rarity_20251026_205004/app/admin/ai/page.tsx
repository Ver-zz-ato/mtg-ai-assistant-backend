'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key: string, value: any) {
  const r = await fetch('/api/admin/config', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key, value }) });
  const j = await r.json();
  if (!r.ok || j?.ok===false) throw new Error(j?.error||'save_failed');
}

export default function AiPage(){
  const [prompts, setPrompts] = React.useState<any>({ version: 'v1', templates: { system: '', user: '' }, ab: { a:true, b:false } });
  const [packs, setPacks] = React.useState<any>({ fast_swaps:true, combo_checks:true, rules_snippet:true });
  const [moderation, setModeration] = React.useState<any>({ allow: [], block: [] });
  const [metrics, setMetrics] = React.useState<any>(null);
  const [personaSeeds, setPersonaSeeds] = React.useState<string>('');
  const [personas, setPersonas] = React.useState<{ available: boolean; by_persona: Array<{ persona_id: string; messages: number }>; window_days?: number } | null>(null);
  const [personaDays, setPersonaDays] = React.useState<number>(30);
  const [busy, setBusy] = React.useState(false);

  const loadPersonas = React.useCallback(async (days?: number) => {
    try {
      const d = days ?? personaDays;
      const r = await fetch(`/api/admin/personas/summary?days=${encodeURIComponent(String(d))}`, { cache:'no-store' });
      const j = await r.json();
      if (j?.ok) setPersonas({ available: !!j.available, by_persona: j.by_persona||[], window_days: j.window_days||d });
    } catch {}
  }, [personaDays]);

  React.useEffect(()=>{ (async()=>{
    try { const r = await fetch('/api/admin/config?key=prompts&key=chat_packs&key=moderation&key=ai.persona.seeds', { cache:'no-store' }); const j = await r.json(); if (j?.config?.prompts) setPrompts(j.config.prompts); if (j?.config?.chat_packs) setPacks(j.config.chat_packs); if (j?.config?.moderation) setModeration(j.config.moderation); if (j?.config?.["ai.persona.seeds"]) setPersonaSeeds(JSON.stringify(j.config["ai.persona.seeds"], null, 2)); } catch {}
    try { const r = await fetch('/api/admin/metrics/llm?days=7'); const j = await r.json(); if (j?.ok) setMetrics(j); } catch {}
    loadPersonas();
  })(); }, [loadPersonas]);

  async function savePrompts(){ setBusy(true); try { await saveConfig('prompts', prompts); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally { setBusy(false);} }
  async function savePacks(){ setBusy(true); try { await saveConfig('chat_packs', packs); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally { setBusy(false);} }
  async function saveModeration(){ setBusy(true); try { await saveConfig('moderation', moderation); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally { setBusy(false);} }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">AI & Chat Quality</div>
      <ELI5 heading="AI & Chat Quality" items={[
        'Edit the system prompt and canned responses that shape answers.',
        'Toggle packs (like Combo checks) on/off without deploying.',
        'Set allow/block lists for moderation.',
        'See model usage and cost at a glance.',
        'Seed personas and view which ones users actually engage with.',
        'Open knowledge gaps and queue tiny eval runs to test prompt changes.'
      ]} />

      {/* Prompt library */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Prompt & System‑Note Library <HelpTip text="Change how the assistant thinks (system) and starts (user). AB flags let you test two variants." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label>Version<input value={prompts.version||''} onChange={e=>setPrompts((p:any)=>({...p, version:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label className="sm:col-span-2">System<textarea value={prompts.templates?.system||''} onChange={e=>setPrompts((p:any)=>({...p, templates:{...p.templates, system:e.target.value}}))} className="w-full h-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label className="sm:col-span-2">User<textarea value={prompts.templates?.user||''} onChange={e=>setPrompts((p:any)=>({...p, templates:{...p.templates, user:e.target.value}}))} className="w-full h-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!prompts.ab?.a} onChange={e=>setPrompts((p:any)=>({...p, ab:{...p.ab, a:e.target.checked}}))}/> A</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!prompts.ab?.b} onChange={e=>setPrompts((p:any)=>({...p, ab:{...p.ab, b:e.target.checked}}))}/> B</label>
        </div>
        <button onClick={savePrompts} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Prompts</button>
      </section>

      {/* Packs */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Canned Answer Packs <HelpTip text="Toggle pre‑written helpers (like Fast Swaps or Rules snippets) used to speed up answers." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.fast_swaps} onChange={e=>setPacks((p:any)=>({...p, fast_swaps:e.target.checked}))}/> Fast Swaps</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.combo_checks} onChange={e=>setPacks((p:any)=>({...p, combo_checks:e.target.checked}))}/> Combo checks</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!packs.rules_snippet} onChange={e=>setPacks((p:any)=>({...p, rules_snippet:e.target.checked}))}/> Rules snippet</label>
        </div>
        <button onClick={savePacks} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Packs</button>
      </section>

      {/* Moderation */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Moderation & Filters <HelpTip text="Allow or block words/ids. Useful for quick hotfixes while longer-term filters ship." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label>Allow list (comma separated)<input value={(moderation.allow||[]).join(', ')} onChange={e=>setModeration((p:any)=>({...p, allow:e.target.value.split(',').map((s)=>s.trim()).filter(Boolean)}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label>Block list (comma separated)<input value={(moderation.block||[]).join(', ')} onChange={e=>setModeration((p:any)=>({...p, block:e.target.value.split(',').map((s)=>s.trim()).filter(Boolean)}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
        </div>
        <button onClick={saveModeration} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Moderation</button>
      </section>

      {/* Persona Seeds */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Persona Seeds (live config) <HelpTip text="Define available personas and their traits. Saved directly to app_config; no deploy needed." /></div>
        <div className="text-xs opacity-75">Key: <code>ai.persona.seeds</code> in app_config</div>
        <textarea value={personaSeeds} onChange={e=>setPersonaSeeds(e.target.value)} className="w-full h-40 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs" />
        <div>
          <button onClick={async()=>{ try{ const obj = JSON.parse(personaSeeds||'{}'); await saveConfig('ai.persona.seeds', obj); alert('Saved'); } catch(e:any){ alert(e?.message || 'Invalid JSON or save failed'); } }} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save Persona Seeds</button>
        </div>
      </section>

      {/* Metrics */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">LLM Metrics (7d) <HelpTip text="Call counts, tokens, and cost by model over the last week." /></div>
        {!metrics ? (<div className="text-sm opacity-70">Loading…</div>) : (
          <table className="min-w-full text-sm">
            <thead><tr><th className="text-left py-1 px-2">Model</th><th className="text-left py-1 px-2">Calls</th><th className="text-left py-1 px-2">Input tokens</th><th className="text-left py-1 px-2">Output tokens</th><th className="text-left py-1 px-2">Cost $</th></tr></thead>
            <tbody>
              {Object.entries(metrics.byModel||{}).map(([m,v]:any)=>(
                <tr key={m} className="border-t border-neutral-900"><td className="py-1 px-2 font-mono">{m}</td><td className="py-1 px-2">{v.count}</td><td className="py-1 px-2">{v.it}</td><td className="py-1 px-2">{v.ot}</td><td className="py-1 px-2">{v.cost.toFixed(4)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Personas */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Persona usage <HelpTip text="Which personas users actually message. Helps prune or promote voices." /></div>
          <div className="flex items-center gap-2 text-xs">
            <label className="opacity-70">Days</label>
            <input type="number" value={personaDays} onChange={e=>setPersonaDays(parseInt(e.target.value||'30',10))} className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
            <button onClick={()=>loadPersonas()} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Reload</button>
          </div>
        </div>
        {!personas ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : (!personas.available ? (
          <div className="text-sm opacity-70">persona_id column not available on ai_usage — falling back to PostHog events only.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs opacity-70">Window: last {personas.window_days ?? personaDays} days</div>
            <div className="space-y-1">
              {(() => {
                const max = Math.max(1, ...personas.by_persona.map(p=>p.messages));
                return personas.by_persona.map(p => (
                  <div key={p.persona_id} className="flex items-center gap-2">
                    <div className="w-56 truncate font-mono text-[11px]" title={p.persona_id}>{p.persona_id}</div>
                    <div className="flex-1 h-3 bg-neutral-900 rounded">
                      <div className="h-3 rounded bg-blue-600" style={{ width: `${Math.max(2, Math.round(p.messages*100/max))}%` }} />
                    </div>
                    <div className="w-16 text-right text-xs font-mono">{p.messages}</div>
                  </div>
                ));
              })()}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm mt-2">
                <thead><tr><th className="text-left py-1 px-2">Persona</th><th className="text-right py-1 px-2">Messages</th></tr></thead>
                <tbody>
                  {personas.by_persona.map((p)=> (
                    <tr key={p.persona_id} className="border-t border-neutral-900"><td className="py-1 px-2 font-mono">{p.persona_id}</td><td className="py-1 px-2 text-right">{p.messages}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      {/* Knowledge Gaps & Eval Playground */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Knowledge Gaps <HelpTip text="Recent questions we failed or answered poorly. Use to improve prompts or add packs." /></div>
        <button onClick={async()=>{ try{ const r=await fetch('/api/admin/knowledge-gaps?limit=200'); const j=await r.json(); if(j?.ok){ const w=window.open('about:blank','_blank'); if(w){ w.document.write('<pre style=\"white-space:pre-wrap; font-family:monospace; padding:12px;\">'+JSON.stringify(j.rows,null,2)+'</pre>'); } } } catch(e:any){ alert(e?.message||'failed'); } }} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Open last 200 in new tab</button>

        <div className="font-medium">Eval Playground <HelpTip text="Run a tiny evaluation suite to sanity‑check prompt changes before rolling out." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label>Suite<input id="suite" defaultValue="smoke" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <label className="sm:col-span-2">Prompts<textarea id="prompts" defaultValue='["Explain Commander mulligan in one sentence","Suggest 3 budget swaps for Sol Ring","Show the probability of drawing 2 lands by turn 3"]' className="w-full h-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <button onClick={async()=>{ try{ const suite=(document.getElementById('suite') as HTMLInputElement).value; const prompts=JSON.parse((document.getElementById('prompts') as HTMLTextAreaElement).value||'[]'); const r=await fetch('/api/admin/evals',{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({ suite, prompts })}); const j=await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'failed'); alert('Eval queued'); } catch(e:any){ alert(e?.message||'failed'); } }} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm">Queue Tiny Eval</button>
          <button onClick={async()=>{ try{ const r=await fetch('/api/admin/evals?limit=50'); const j=await r.json(); if(j?.ok){ const w=window.open('about:blank','_blank'); if(w){ w.document.write('<pre style=\"white-space:pre-wrap; font-family:monospace; padding:12px;\">'+JSON.stringify(j.rows,null,2)+'</pre>'); } } } catch(e:any){ alert(e?.message||'failed'); } }} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Open recent runs</button>
        </div>
      </section>
    </div>
  );
}
