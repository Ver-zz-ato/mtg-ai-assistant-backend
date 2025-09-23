// Minimal shared utils used by components (e.g., HistoryDropdown)
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
