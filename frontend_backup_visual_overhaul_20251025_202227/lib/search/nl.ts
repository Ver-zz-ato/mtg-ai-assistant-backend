// lib/search/nl.ts
export function mapToScryfall(q: string) {
  const src = (q || "").toLowerCase();
  const parts: string[] = [];

  // colors (basic and some guild hints)
  if (/\bwhite\b|\bmono[-\s]?white\b/.test(src)) parts.push("c:w");
  if (/\bblue\b|\bmono[-\s]?blue\b/.test(src)) parts.push("c:u");
  if (/\bblack\b|\bmono[-\s]?black\b/.test(src)) parts.push("c:b");
  if (/\bred\b|\bmono[-\s]?red\b/.test(src)) parts.push("c:r");
  if (/\bgreen\b|\bmono[-\s]?green\b/.test(src)) parts.push("c:g");

  // types
  if (/\binstant\b/.test(src)) parts.push("type:instant");
  if (/\bsorcery\b/.test(src)) parts.push("type:sorcery");
  if (/\bcreature\b/.test(src)) parts.push("type:creature");
  if (/\bartifact\b/.test(src)) parts.push("type:artifact");
  if (/\benchant(ment)?\b/.test(src)) parts.push("type:enchantment");
  if (/\bplaneswalker\b/.test(src)) parts.push("type:planeswalker");
  if (/\blegendary\b/.test(src)) parts.push("is:legendary");

  // rarity
  if (/\bmythic\b/.test(src)) parts.push("r:mythic");
  else if (/\brare\b/.test(src)) parts.push("r:rare");
  else if (/\buncommon\b/.test(src)) parts.push("r:uncommon");
  else if (/\bcommon\b/.test(src)) parts.push("r:common");

  // text keywords and OR/AND patterns
  const textKeys = ["flying","lifelink","deathtouch","hexproof","trample","ward","draw","counter","destroy","exile","treasure","scry","proliferate"];
  const found: string[] = [];
  for (const k of textKeys) if (new RegExp(`\\b${k}\\b`).test(src)) found.push(k);
  if (found.length) {
    const mapped = found.map(k => (k === 'draw' ? 'o:"draw a card"' : 'o:' + k)).join(' and ');
    parts.push('(' + mapped + ')');
  }
  // any:foo,bar,baz -> (o:foo or o:bar or o:baz)
  const anyMatch = src.match(/any\s*:\s*([a-z0-9 ,]+)/);
  if (anyMatch) {
    const list = anyMatch[1].split(/[, ]+/).filter(Boolean);
    if (list.length) parts.push(`(${list.map(v=>`o:${v}`).join(" or ")})`);
  }
  // explicit OR list like "flying or trample" already covered by found[]; but add simple combine
  if (/\\bor\\b/.test(src) && found.length>=2) {
    parts.pop(); // replace last AND bundle
    const mappedOr = found.map(k => (k === 'draw' ? 'o:"draw a card"' : 'o:' + k)).join(' or ');
    parts.push('(' + mappedOr + ')');
  }

  // mana cost
  const cmcLTE = src.match(/cmc\s*(?:<=|<|at\s*most)\s*(\d+)/); if (cmcLTE) parts.push(`cmc<=${cmcLTE[1]}`);
  const cmcGTE = src.match(/cmc\s*(?:>=|>|at\s*least)\s*(\d+)/); if (cmcGTE) parts.push(`cmc>=${cmcGTE[1]}`);

  // price
  const usdLTE = src.match(/(?:\$|usd)\s*(?:<=|<|under|below|under\s*\$)\s*(\d+(?:\.\d+)?)/); if (usdLTE) parts.push(`usd<=${usdLTE[1]}`);

  // format
  if (/\bcommander\b|\bedh\b/.test(src)) parts.push("legal:commander");
  if (/\bmodern\b/.test(src)) parts.push("legal:modern");

  // power/toughness
  const pwr = src.match(/power\s*>=\s*(\d+)/); if (pwr) parts.push(`pow>=${pwr[1]}`);
  const tou = src.match(/toughness\s*>=\s*(\d+)/); if (tou) parts.push(`tou>=${tou[1]}`);

  // name contains
  const nameLike = src.match(/name\s*:(.+)$/); if (nameLike) parts.push(`name:${nameLike[1].trim()}`);

  const sf = parts.filter(Boolean).join(" ") || src;
  return sf.trim();
}