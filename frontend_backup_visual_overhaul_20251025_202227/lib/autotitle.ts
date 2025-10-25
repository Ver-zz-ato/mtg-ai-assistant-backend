// lib/autotitle.ts
const BASIC_LANDS = new Set(["plains","island","swamp","mountain","forest","wastes"]);

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeName(s: string): string {
  return (s || "")
    .trim()
    .replace(/^SB:\s*/i, "")
    .replace(/^\d+\s*[xX]?\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*-\s*/g, " - ");
}

function pickDeckTitle(lines: string[]): string {
  // Prefer first non-basic card from the first ~15 lines
  for (const l of lines.slice(0, 15)) {
    const name = normalizeName(l);
    if (!BASIC_LANDS.has(name.toLowerCase())) return name;
  }
  return normalizeName(lines[0] || "Untitled");
}

async function maybeFuzzy(name: string): Promise<string> {
  const q = name.replace(/[^\w\s,'-]/g, "").trim();
  if (!q) return "Untitled";
  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q)}`, { next: { revalidate: 3600 } });
    if (!r.ok) return toTitleCase(q);
    const data = await r.json().catch(() => ({}));
    if (data && typeof data.name === "string" && data.name.trim()) return data.name;
    return toTitleCase(q);
  } catch {
    return toTitleCase(q);
  }
}

export async function getAutoTitle(raw: string): Promise<string | null> {
  const text = (raw || "").trim();
  if (!text) return null;

  // 1) Slash-commands: /price sol ring  -> "price check: Sol Ring"
  const slash = text.match(/^\/(\w+)\s+(.+)$/i);
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const arg = normalizeName(slash[2]);
    const pretty = await maybeFuzzy(arg);
    const label = cmd === "price" ? "price check"
                : cmd === "search" ? "card search"
                : cmd === "legal" ? "legality check"
                : cmd;
    return `${label}: ${pretty}`;
  }

  // 2) Decklist paste: detect many lines like "1 Lightning Bolt"
  const lines = text.replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
  const qtyLine = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const cardish = lines.filter(l => qtyLine.test(l));
  if (cardish.length >= 3) {
    const name = pickDeckTitle(cardish);
    const pretty = await maybeFuzzy(name);
    return pretty;
  }

  // 3) Plain chat: first 5–7 meaningful words
  const words = text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const keep = words.slice(0, Math.min(words.length, 7)).join(" ");
  return toTitleCase(keep || "Untitled");
}