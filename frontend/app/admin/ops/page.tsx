'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key: string, value: any) {
  const r = await fetch('/api/admin/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value }) });
  const j = await r.json();
  if (!r.ok || j?.ok === false) throw new Error(j?.error || 'save_failed');
}

export default function OpsPage() {
  const [flags, setFlags] = React.useState<any>({ widgets: true, chat_extras: true, risky_betas: false });
  const [maint, setMaint] = React.useState<any>({ enabled: false, message: '' });
  const [budget, setBudget] = React.useState<any>({ daily_usd: 0, weekly_usd: 0 });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/admin/config?key=flags&key=maintenance&key=llm_budget', { cache: 'no-store' });
      const j = await r.json();
      if (j?.config?.flags) setFlags(j.config.flags);
      if (j?.config?.maintenance) setMaint(j.config.maintenance);
      if (j?.config?.llm_budget) setBudget(j.config.llm_budget);
    } catch {}
  })(); }, []);

  async function saveFlags() { setBusy(true); try { await saveConfig('flags', flags); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function saveMaint() { setBusy(true); try { await saveConfig('maintenance', maint); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function saveBudget() { setBusy(true); try { await saveConfig('llm_budget', { daily_usd: Number(budget.daily_usd)||0, weekly_usd: Number(budget.weekly_usd)||0 }); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function rollback() { setBusy(true); try { const r = await fetch('/api/admin/ops/rollback-snapshot', { method:'POST' }); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'rollback_failed'); alert(`Snapshot set to ${j.snapshotDate}`); } catch(e:any){ alert(e?.message||'failed'); } finally{ setBusy(false);} }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Ops & Safety</div>
      <ELI5 heading="Ops & Safety" items={[
        'Flip features on or off (kill switches) when something misbehaves.',
        'Show a maintenance banner or fully pause the app if needed.',
        'Put a hard daily/weekly cost cap for LLM usage to avoid surprise bills.',
        'If pricing data goes wrong, rollback to yesterday\'s snapshot with one click.'
      ]} />

      {/* Flags & Kill Switches */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Feature Flags & Kill Switches <HelpTip text="Turn whole feature areas on/off instantly. Safe to toggle anytime; takes effect immediately for new requests." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.widgets} onChange={e=>setFlags((p:any)=>({...p, widgets:e.target.checked}))}/> <span>Widgets</span></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.chat_extras} onChange={e=>setFlags((p:any)=>({...p, chat_extras:e.target.checked}))}/> <span>Chat extras</span></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.risky_betas} onChange={e=>setFlags((p:any)=>({...p, risky_betas:e.target.checked}))}/> <span>Risky betas</span></label>
        </div>
        <button onClick={saveFlags} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Flags</button>
      </section>

      {/* Maintenance Mode */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Maintenance Mode + Banner <HelpTip text="Show a friendly banner and optionally gate traffic while you fix something. Message appears site‑wide." /></div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!maint.enabled} onChange={e=>setMaint((p:any)=>({...p, enabled:e.target.checked}))}/> <span>Enabled</span></label>
        <input value={maint.message||''} onChange={e=>setMaint((p:any)=>({...p, message:e.target.value}))} placeholder="We’re tinkering…" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
        <button onClick={saveMaint} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Maintenance</button>
      </section>

      {/* Budget caps */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Emergency Budget Caps (LLM) <HelpTip text="Hard limits for AI spend. When reached, non‑critical AI calls are blocked until the next window." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-sm">Daily USD<input type="number" value={budget.daily_usd||0} onChange={e=>setBudget((p:any)=>({...p, daily_usd:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
          <label className="text-sm">Weekly USD<input type="number" value={budget.weekly_usd||0} onChange={e=>setBudget((p:any)=>({...p, weekly_usd:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
        </div>
        <button onClick={saveBudget} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Budget Caps</button>
      </section>

      {/* Snapshot rollback */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Snapshot Rollback <HelpTip text="If a price import is bad, switch back to yesterday\'s snapshot instantly. Reversible by rebuilding today." /></div>
        <button onClick={rollback} disabled={busy} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm">Rollback to Yesterday</button>
      </section>
    </div>
  );
}
