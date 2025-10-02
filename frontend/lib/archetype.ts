// frontend/lib/archetype.ts
export type ArchetypeScores = { aggro: number; control: number; combo: number; midrange: number; stax: number };

export function emptyScores(): ArchetypeScores {
  return { aggro: 0, control: 0, combo: 0, midrange: 0, stax: 0 };
}

export function scoreCard(type_line: string, oracle_text: string, cmc: number, qty: number): ArchetypeScores {
  const type = String(type_line || "");
  const text = String(oracle_text || "").toLowerCase();
  const q = Math.min(Math.max(Number(qty || 1), 1), 4);
  const out = emptyScores();
  if (type.includes("Creature")) { out.aggro += 0.5*q; out.midrange += 0.2*q; }
  if (type.includes("Instant") || type.includes("Sorcery")) { out.control += 0.2*q; out.combo += 0.1*q; }
  if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { out.control += 0.6*q; }
  if (/search your library/.test(text) || /tutor/.test(text)) { out.combo += 0.6*q; }
  if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
     || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) { out.stax += 0.8*q; }
  if (Number(cmc) <= 2 && type.includes('Creature')) { out.aggro += 0.2*q; }
  if (Number(cmc) >= 5 && type.includes('Creature')) { out.midrange += 0.2*q; }
  return out;
}

export function addScores(a: ArchetypeScores, b: ArchetypeScores): ArchetypeScores {
  return {
    aggro: a.aggro + b.aggro,
    control: a.control + b.control,
    combo: a.combo + b.combo,
    midrange: a.midrange + b.midrange,
    stax: a.stax + b.stax,
  };
}
