'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type CurrencyPref = 'USD' | 'EUR' | 'GBP';

export const CURRENCY_STORAGE_KEY = 'manatap_currency';
const LEGACY_CURRENCY_STORAGE_KEY = 'price_currency';

export function normalizeCurrency(input: unknown): CurrencyPref | null {
  const currency = String(input || '').trim().toUpperCase();
  if (currency === 'USD' || currency === 'EUR' || currency === 'GBP') return currency;
  return null;
}

function readBrowserCurrency(): CurrencyPref | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      normalizeCurrency(window.localStorage.getItem(CURRENCY_STORAGE_KEY)) ||
      normalizeCurrency(window.localStorage.getItem(LEGACY_CURRENCY_STORAGE_KEY))
    );
  } catch {
    return null;
  }
}

function persistBrowserCurrency(currency: CurrencyPref) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    window.localStorage.setItem(LEGACY_CURRENCY_STORAGE_KEY, currency);
    window.dispatchEvent(new CustomEvent('manatap:currency-changed', { detail: { currency } }));
  } catch {}
}

/** Map browser locale to default currency. GBP for UK, EUR for Eurozone/Europe, USD for Americas and fallback. */
function getDefaultCurrencyFromLocale(): CurrencyPref {
  if (typeof navigator === 'undefined') return 'USD';
  const locale = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
  const region = locale.split(/[-_]/)[1] || ''; // e.g. "gb" from "en-gb"
  if (region === 'gb' || region === 'uk') return 'GBP';
  if (['us', 'ca', 'mx'].includes(region)) return 'USD';
  const eurRegions = ['de', 'fr', 'it', 'es', 'nl', 'pt', 'at', 'be', 'ie', 'fi', 'gr', 'el', 'lu', 'mt', 'sk', 'si', 'ee', 'lv', 'lt', 'cy', 'pl'];
  if (eurRegions.includes(region)) return 'EUR';
  return 'USD';
}

export type PrefsState = {
  // extendable bag of user preferences (theme, format, etc.)
  [key: string]: any;
};

export type PrefsContextValue = {
  prefs: PrefsState;
  setPrefs: React.Dispatch<React.SetStateAction<PrefsState>>;

  // Extra optional helpers for ModeOptions compatibility
  mode?: string;
  format?: string;
  setFormat?: (f: string) => void;
  plan?: string;
  setPlan?: (p: string) => void;
  colors?: string[];
  toggleColor?: (c: string) => void;
  clearColors?: () => void;
  currency?: string;
  setCurrency?: (c: string) => void;
  teaching?: boolean;
  setTeaching?: (t: boolean) => void;
};

const Prefs = createContext<PrefsContextValue | undefined>(undefined);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<PrefsState>({});

  // Set currency from persisted guest/user browser preference, then locale fallback.
  useEffect(() => {
    setPrefs((p) => {
      const current = normalizeCurrency(p.currency);
      if (current) return p;
      return { ...p, currency: readBrowserCurrency() || getDefaultCurrencyFromLocale() };
    });
  }, []);

  useEffect(() => {
    function syncCurrency(event: Event) {
      const next =
        event instanceof StorageEvent
          ? normalizeCurrency(event.newValue)
          : normalizeCurrency((event as CustomEvent<{ currency?: string }>).detail?.currency);
      if (!next) return;
      setPrefs((p) => (normalizeCurrency(p.currency) === next ? p : { ...p, currency: next }));
    }
    window.addEventListener('storage', syncCurrency);
    window.addEventListener('manatap:currency-changed', syncCurrency);
    return () => {
      window.removeEventListener('storage', syncCurrency);
      window.removeEventListener('manatap:currency-changed', syncCurrency);
    };
  }, []);

  // Derived helpers used by ModeOptions and pages
  const format = (prefs.format ?? '').toString() || undefined;
  const plan = (prefs.plan ?? '').toString() || undefined;
  const colors = Array.isArray(prefs.colors) ? (prefs.colors as string[]) : [];
  const currency = (prefs.currency ?? '').toString() || undefined;
  const teaching = !!prefs.teaching;

  const setFormat = (f: string) => setPrefs(p => ({ ...p, format: f }));
  const setPlan = (pval: string) => setPrefs(p => ({ ...p, plan: pval }));
  const toggleColor = (c: string) => setPrefs(p => {
    const arr = Array.isArray(p.colors) ? [...p.colors] : [];
    const i = arr.indexOf(c);
    if (i >= 0) arr.splice(i, 1); else arr.push(c);
    return { ...p, colors: arr };
  });
  const clearColors = () => setPrefs(p => ({ ...p, colors: [] }));
  const setCurrency = useCallback((c: string) => {
    const next = normalizeCurrency(c) || 'USD';
    persistBrowserCurrency(next);
    setPrefs(p => ({ ...p, currency: next }));
  }, []);
  const setTeaching = (t: boolean) => setPrefs(p => ({ ...p, teaching: !!t }));

  const value = useMemo(
    () => ({
      prefs, setPrefs,
      format, setFormat,
      plan, setPlan,
      colors, toggleColor, clearColors,
      currency, setCurrency,
      teaching, setTeaching,
    }),
    [prefs, format, plan, colors, currency, teaching, setCurrency]
  );

  return <Prefs.Provider value={value}>{children}</Prefs.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(Prefs);
  if (!ctx) {
    // Keep the explicit error so we notice if the provider is ever missing again.
    throw new Error('usePrefs must be used within PrefsProvider');
  }
  return ctx;
}
