// Minimal util shim to satisfy `@/lib/util` imports.
// Safe, tiny, and tree-shakeable.
export function clamp(input: string | undefined | null, max: number = 48): string {
  const s = (input ?? "").toString();
  if (!s) return "";
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
}

// You can add other helpers here later as needed.
export default { clamp };
