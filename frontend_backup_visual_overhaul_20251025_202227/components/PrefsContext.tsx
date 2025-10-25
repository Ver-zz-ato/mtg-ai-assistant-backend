'use client';
import React, { createContext, useContext, useMemo, useState } from 'react';

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
  const setCurrency = (c: string) => setPrefs(p => ({ ...p, currency: (c || 'USD').toUpperCase() }));
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
    [prefs, format, plan, colors, currency, teaching]
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
