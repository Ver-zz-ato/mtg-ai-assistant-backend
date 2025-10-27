/**
 * Drop-in hints for wiring /analyze in your Chat.tsx:
 *
 * - If user input starts with "/analyze" or looks like a decklist, call:
 *   fetch("/api/chat/commands/analyze", { method:"POST", body: JSON.stringify({ threadId, deckText: text }) })
 *   then append the returned assistant message.
 *
 * - Otherwise call /api/chat as usual.
 */
export function looksDecklist(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  let hits = 0;
  for (const l of lines) {
    if (/^\d+\s*x?\s+/i.test(l)) hits++;
    else if (/^\*\s+/.test(l)) hits++;
    else if (/^\-\s+/.test(l)) hits++;
    else if (/^\[\[.+\]\]$/.test(l)) hits++;
    else if (/^sideboard\b/i.test(l)) hits++;
  }
  return hits >= 8;
}
