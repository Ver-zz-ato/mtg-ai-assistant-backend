import type { AnalyzeFormat } from "@/lib/deck/formatRules";

export const BUILD_DECK_HANDOFF_KEY = "manatap:build-deck-handoff";

export type BuildDeckHandoff = {
  format: AnalyzeFormat;
  commander?: string;
  idea?: string;
  colors?: string[];
  budget?: "Budget" | "Moderate" | "High";
  power?: "Casual" | "Mid" | "Focused" | "Optimized" | "Competitive";
  sourceLabel?: string;
};

export function saveBuildDeckHandoff(handoff: BuildDeckHandoff): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BUILD_DECK_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {}
}

export function loadBuildDeckHandoff(): BuildDeckHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BUILD_DECK_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuildDeckHandoff;
    return parsed && typeof parsed.format === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBuildDeckHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BUILD_DECK_HANDOFF_KEY);
  } catch {}
}
