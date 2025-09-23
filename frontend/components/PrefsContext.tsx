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
};

const Prefs = createContext<PrefsContextValue | undefined>(undefined);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<PrefsState>({});
  const value = useMemo(() => ({ prefs, setPrefs }), [prefs]);
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
