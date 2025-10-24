'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

function isAllowedHost() {
  try { return location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'; } catch { return true; }
}

export default function AdminMonetizePage() {
  const [cfg, setCfg] = React.useState({ stripe: true, kofi: true, paypal: true });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/config', { cache: 'no-store' }); const j = await r.json(); if (j?.ok && j?.monetize) setCfg(j.monetize); } catch {}
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/monetize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'save_failed');
      alert('Saved');
    } catch (e:any) { alert(e?.message || 'Save failed'); } finally { setSaving(false); }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-3">
      <h1 className="text-xl font-semibold">Admin • Monetization</h1>
      <ELI5 heading="Monetization Controls" items={[
        "💳 Toggle Payment Buttons: Show/hide Ko-fi, PayPal, Stripe links across the site",
        "💰 Instant Effect: Changes apply immediately - no deploy needed!",
        "🎯 Use Cases: Disable a payment provider if having issues, test different combinations",
        "⚙️ Saved in app_config → monetize key",
        "⏱️ When to use: Changing payment providers, temporarily disabling payments",
        "🔄 How often: Rarely - only when payment provider status changes",
        "💡 Users see these buttons in footer, pricing page, and support page"
      ]} />
      <p className="text-sm opacity-80">Toggle which donation/payment buttons are visible. Saved in app_config → key "monetize".</p>

      <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.stripe} onChange={e=>setCfg(p=>({...p, stripe: e.target.checked}))}/> <span>Stripe</span></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.kofi} onChange={e=>setCfg(p=>({...p, kofi: e.target.checked}))}/> <span>Ko‑fi</span></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.paypal} onChange={e=>setCfg(p=>({...p, paypal: e.target.checked}))}/> <span>PayPal</span></label>

      <div>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60">Save</button>
      </div>
    </div>
  );
}