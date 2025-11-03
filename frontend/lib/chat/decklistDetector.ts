/**
 * Shared utility for detecting decklists in text
 * Extracted from Chat.tsx for reuse in API routes
 */
export function isDecklist(text: string): boolean {
  if (!text) return false;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  let hits = 0;
  const rxQty = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const rxDash = /^-\s+.+$/;
  for (const l of lines) {
    if (rxQty.test(l) || rxDash.test(l)) hits++;
  }
  return hits >= Math.max(6, Math.floor(lines.length * 0.5));
}

