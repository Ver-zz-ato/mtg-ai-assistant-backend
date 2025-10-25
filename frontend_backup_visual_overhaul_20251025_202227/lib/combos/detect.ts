import combos from "@/data/combos.json" assert { type: "json" };

export type ComboSeed = {
  name: string;
  requires: string[]; // card names or coarse categories
  tags?: string[];
  note?: string;
};
export type ComboHit = { name: string; pieces: string[]; note?: string; tags?: string[] };
export type ComboMissing = { name: string; have: string[]; missing: string[]; suggest: string; note?: string; tags?: string[] };

function norm(s: string): string {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeDeckNames(deckText: string): string[] {
  const out = new Set<string>();
  const lines = String(deckText || "").replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const l = raw.trim(); if (!l) continue;
    const m = l.match(/^(?:SB:\s*)?(\d+)\s*[xX]?\s+(.+)$/) || l.match(/^(.+?)\s+[xX]\s*(\d+)$/);
    const name = m ? (m[2] || m[1] || "").trim() : l;
    if (!name) continue;
    out.add(norm(name));
  }
  return Array.from(out);
}

export function detectCombos(names: string[]): { present: ComboHit[]; missing: ComboMissing[] } {
  const have = new Set(names.map(norm));
  const present: ComboHit[] = [];
  const missing: ComboMissing[] = [];
  const seeds = combos as ComboSeed[];

  for (const c of seeds) {
    const req = (c.requires || []).map(norm).filter(Boolean);
    if (req.length < 2) continue;
    const hitCount = req.filter(r => have.has(r)).length;
    if (hitCount === req.length) {
      present.push({ name: c.name, pieces: c.requires.slice(), note: c.note, tags: c.tags });
    } else if (hitCount === req.length - 1) {
      const miss = req.filter(r => !have.has(r));
      const havePieces = req.filter(r => have.has(r));
      const suggest = miss[0] || "";
      missing.push({ name: c.name, have: havePieces.map(h=>h), missing: miss.map(m=>m), suggest, note: c.note, tags: c.tags });
    }
  }

  return { present, missing };
}

// --- v2: category-aware detection using Scryfall details ---
export type CardDetail = { type_line?: string; oracle_text?: string | null; name?: string };
export function detectCombosSmart(names: string[], details: Record<string, CardDetail>): { present: ComboHit[]; missing: ComboMissing[] } {
  const haveName = new Set(names.map(norm));
  const normDetails = new Map<string, CardDetail>();
  for (const [k, v] of Object.entries(details || {})) normDetails.set(norm(k), v || {});

  // Precompute deck features
  let rocks = 0, hasWalker = false, hasTreasure = false, hasVampire = false, hasSacOutlet = false, rampCount = 0, staxCount = 0, etbTokens2plus = 0;
  const tokenTypeCounts = new Map<string, number>(); // e.g., treasure->N, soldier->N
  const numberWord = /(two|three|four|five|six|seven|eight|nine|ten|\b2\b|\b3\b|\b4\b|\b5\b|\b6\b|\b7\b|\b8\b|\b9\b|\b10\b)/i;
  for (const key of haveName) {
    const d = normDetails.get(key) || {};
    const t = String(d.type_line||'');
    const o = String(d.oracle_text||'');
    const rawName = String(d.name||'');
    if (/Planeswalker/i.test(t)) hasWalker = true;
    if (/create/i.test(o) && /treasure token/i.test(o)) { hasTreasure = true; tokenTypeCounts.set('treasure', (tokenTypeCounts.get('treasure')||0)+1); }
    if (/Vampire/i.test(t)) hasVampire = true;
    if (/(^|\W)signet\b|\btalisman\b|sol ring|arcane signet|fellwar stone|mind stone|guardian idol|prismatic lens|coldsteel heart|thought vessel|worn powerstone/i.test(rawName) || (/Artifact/i.test(t) && /add\s*\{[wubrgc]/i.test(o))) rocks += 1;
    if (/sacrifice (another )?creature/i.test(o) || /sacrifice a creature:/i.test(o)) hasSacOutlet = true;
    if (/search your library for (a|up to .*?) land/i.test(o) || /add\s*\{[wubrg]/i.test(o)) rampCount += 1;
    if (/doesn['’]t untap|players can['’]?t|skip your|unless you pay|rule of law|winter orb|static orb|stasis|sphere of resistance/i.test(o+" "+rawName)) staxCount += 1;
    if (/create/i.test(o) && /token/i.test(o) && numberWord.test(o)) etbTokens2plus += 1;
    // Generic token type extraction, best effort
    try {
      const m = o.match(/create\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+([a-z0-9\-\s]+?)\s+token/i);
      if (m && m[1]) {
        const type = norm(m[1]).replace(/\bartifact\b|\bcreature\b|\blegendary\b|\bbox\b|\bwhite\b|\bblue\b|\bblack\b|\bred\b|\bgreen\b/gi, '').trim().split(/\s+/)[0] || 'token';
        const k = type.replace(/[^a-z0-9]+/g,'');
        if (k) tokenTypeCounts.set(k, (tokenTypeCounts.get(k)||0)+1);
      }
    } catch {}
  }

  function reqSatisfied(reqRaw: string): boolean {
    const r = norm(reqRaw);
    if (haveName.has(r)) return true; // exact card present
    if (/net[- ]positive\s*rocks?/.test(r)) {
      // proxy: require 3+ rocks to cover Scepter + Dramatic Reversal lines
      return rocks >= 3;
    }
    if (/mana\s*rock/.test(r)) {
      const m = r.match(/>=\s*(\d+)/); const need = m ? Math.max(1, parseInt(m[1]||'1',10)) : 1;
      return rocks >= need;
    }
    if (/planeswalker/.test(r)) return hasWalker;
    if (/treasure/.test(r)) return hasTreasure;
    if (/vampire/.test(r)) return hasVampire;
    if (/sac\s*outlet/.test(r)) return hasSacOutlet;
    if (/ramp/.test(r)) return rampCount >= 1;
    if (/stax/.test(r)) return staxCount >= 1;
    if (/etb\s*creature.*2\s*token|etb\s*creature.*two\s*token|2\s*token/i.test(r)) return etbTokens2plus >= 1;
    if (/^tokens?:/.test(r)) {
      // tokens:type>=N or tokens:any>=N
      const m = r.match(/^tokens?:\s*([a-z0-9_-]+)(?:\s*>=\s*(\d+))?/);
      let type = m?.[1] || 'any';
      const need = Math.max(1, parseInt(m?.[2] || '1', 10));
      if (type === 'any') {
        let total = 0; for (const v of tokenTypeCounts.values()) total += v; return total >= need;
      }
      type = type.replace(/[^a-z0-9]+/g,'');
      const have = tokenTypeCounts.get(type) || 0;
      return have >= need;
    }
    return false;
  }

  const present: ComboHit[] = [];
  const missing: ComboMissing[] = [];
  const seeds = combos as ComboSeed[];
  for (const c of seeds) {
    const reqs = (c.requires||[]);
    const sat = reqs.map(reqSatisfied);
    const hitCount = sat.filter(Boolean).length;
    if (hitCount === reqs.length) {
      present.push({ name: c.name, pieces: reqs.slice(), note: c.note, tags: c.tags });
    } else if (hitCount === reqs.length - 1) {
      // find which requirement failed to generate a suggest string (best-effort: exact name if provided, else the category placeholder)
      let missIdx = sat.findIndex(v => !v);
      if (missIdx < 0) missIdx = 0;
      const havePieces = reqs.filter((_,i)=>sat[i]);
      const missPieces = reqs.filter((_,i)=>!sat[i]);
      const suggest = missPieces[0] || "";
      missing.push({ name: c.name, have: havePieces.slice(), missing: missPieces.slice(), suggest, note: c.note, tags: c.tags });
    }
  }
  return { present, missing };
}

export function scryfallLink(name: string): string {
  const q = `!\"${name}\"`; // exact name search
  return `https://scryfall.com/search?q=${encodeURIComponent(q)}`;
}
