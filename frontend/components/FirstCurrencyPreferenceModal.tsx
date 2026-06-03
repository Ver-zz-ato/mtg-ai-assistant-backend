'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { CURRENCY_STORAGE_KEY, normalizeCurrency, usePrefs, type CurrencyPref } from '@/components/PrefsContext';

const OPTIONS: Array<{ value: CurrencyPref; label: string; helper: string }> = [
  { value: 'GBP', label: 'GBP', helper: 'British pound' },
  { value: 'EUR', label: 'EUR', helper: 'Euro' },
  { value: 'USD', label: 'USD', helper: 'US dollar' },
];

function promptSeenKey(userId: string) {
  return `manatap_currency_prompt_seen:${userId}`;
}

export default function FirstCurrencyPreferenceModal() {
  const { user, loading } = useAuth();
  const { currency, setCurrency } = usePrefs();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<CurrencyPref>('USD');

  React.useEffect(() => {
    if (loading || !user?.id) return;
    try {
      if (window.localStorage.getItem(promptSeenKey(user.id)) === '1') return;
      setSelected(normalizeCurrency(currency) || normalizeCurrency(window.localStorage.getItem(CURRENCY_STORAGE_KEY)) || 'USD');
      setOpen(true);
    } catch {
      setSelected(normalizeCurrency(currency) || 'USD');
      setOpen(true);
    }
  }, [currency, loading, user?.id]);

  if (!open || !user?.id) return null;

  function savePreference() {
    if (!user?.id) return;
    setCurrency?.(selected);
    try {
      window.localStorage.setItem(promptSeenKey(user.id), '1');
    } catch {}
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="currency-preference-title">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/25 bg-neutral-950 p-5 shadow-2xl shadow-amber-950/30">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">ManaTap</div>
          <h2 id="currency-preference-title" className="mt-1 text-xl font-semibold text-neutral-50">
            Choose your card currency
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-300">
            We will use this for deck values, collection prices, wishlists, and price tools.
          </p>
        </div>

        <div className="grid gap-2">
          {OPTIONS.map((option) => {
            const active = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-50'
                    : 'border-neutral-800 bg-neutral-900/80 text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-neutral-400">{option.helper}</span>
                </span>
                <span className={`h-3 w-3 rounded-full border ${active ? 'border-amber-300 bg-amber-300' : 'border-neutral-600'}`} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={savePreference}
          className="mt-5 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Save preference
        </button>
      </div>
    </div>
  );
}
