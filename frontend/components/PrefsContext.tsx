"use client";
import { createContext, useContext, useState } from "react";

export type Mode = "deck" | "rules" | "price";
export type Format = "Commander" | "Modern" | "Pioneer";
export type Plan = "Budget" | "Optimized";
export type Currency = "USD" | "EUR" | "GBP";
export type Color = "W" | "U" | "B" | "R" | "G";

type PrefsState = {
  mode: Mode;
  format: Format;
  plan: Plan;
  colors: Color[];      // W U B R G
  currency: Currency;

  setMode: (m: Mode) => void;
  setFormat: (f: Format) => void;
  setPlan: (p: Plan) => void;
  setCurrency: (c: Currency) => void;
  toggleColor: (c: Color) => void;
  clearColors: () => void;
};

const Prefs = createContext<PrefsState | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("deck");
  const [format, setFormat] = useState<Format>("Commander");
  const [plan, setPlan] = useState<Plan>("Optimized");
  const [colors, setColors] = useState<Color[]>([]);
  const [currency, setCurrency] = useState<Currency>("USD");

  function toggleColor(c: Color) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }
  function clearColors() { setColors([]); }

  return (
    <Prefs.Provider
      value={{ mode, format, plan, colors, currency, setMode, setFormat, setPlan, setCurrency, toggleColor, clearColors }}
    >
      {children}
    </Prefs.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(Prefs);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
