// lib/ai/persona.ts
export type PersonaInput = {
  format?: string | null; // commander | modern | standard | etc.
  budget?: string | null; // budget | optimized | luxury
  teaching?: boolean | null;
};

export type Persona = { id: string; seed: string };

function cap(s: string): string { return (s||'').trim().toLowerCase(); }

export function selectPersona(input: PersonaInput = {}): Persona {
  const fmt = cap(input.format||'');
  const plan = cap(input.budget||'');
  const teaching = !!input.teaching;

  const parts: string[] = [];
  parts.push(
    "You are ManaTap AI — a concise, trustworthy Magic: The Gathering assistant. Keep responses focused, practical, and friendly. Prefer bullet lists and short steps."
  );

  // Format-specific guardrails
  if (fmt.includes('commander') || fmt === 'edh') {
    parts.push(
      "Commander persona: Respect 100-card singleton. CRITICAL: Every card you suggest MUST match the commander's color identity - check EVERY card before recommending. Never suggest cards with mana symbols outside the commander's colors, even if they would be strategically good. Emphasize synergy with the commander and table politics."
    );
  } else if (fmt.includes('modern')) {
    parts.push("Modern persona: Respect Modern legality; suggest efficient, low-curve options and meta-resilient plans.");
  } else if (fmt.includes('standard')) {
    parts.push("Standard persona: Only Standard-legal options; mention recent set synergies.");
  } else if (fmt.includes('pioneer')) {
    parts.push("Pioneer persona: Respect Pioneer legality (Return to Ravnica onwards); emphasize efficient threats and interaction.");
  } else if (fmt.includes('pauper')) {
    parts.push("Pauper persona: Only common rarity cards allowed; focus on efficient commons and budget-friendly strategies.");
  }

  // Budget axis
  if (plan === 'budget') {
    parts.push("Budget persona: Prefer cheaper swaps and recent reprints; always offer at least one budget alternative.");
  } else if (plan === 'luxury') {
    parts.push("Luxury persona: It’s OK to include premium upgrades where they clearly improve consistency.");
  } else {
    parts.push("Optimized persona: Balance power and cost; avoid unnecessary bling.");
  }

  if (teaching) {
    parts.push("Teaching persona: Briefly define jargon the first time it appears; keep explanations one sentence each.");
  }

  const id = [fmt||'any', plan||'optimized', teaching? 'teach':'plain'].join(':');
  const seed = parts.join('\n');
  return { id, seed };
}

// Async variant that reads optional seeds from app_config (key: 'ai.persona.seeds')
export async function selectPersonaAsync(input: PersonaInput = {}): Promise<Persona> {
  const { getServerSupabase } = await import("@/lib/server-supabase");
  let cfg: any = null;
  try {
    const supa = await getServerSupabase();
    const { data } = await supa.from('app_config').select('value').eq('key','ai.persona.seeds').maybeSingle();
    cfg = (data as any)?.value || null;
  } catch {}

  const base = selectPersona(input);
  if (!cfg || typeof cfg !== 'object') return base;

  const fmt = cap(input.format||'');
  const plan = cap(input.budget||'');
  const teaching = !!input.teaching;

  const parts: string[] = [];
  if (typeof cfg.baseline === 'string' && cfg.baseline.trim()) parts.push(cfg.baseline.trim());

  const fmtSeed = cfg.format && typeof cfg.format[fmt] === 'string' ? cfg.format[fmt] : '';
  const planSeed = cfg.plan && typeof cfg.plan[plan] === 'string' ? cfg.plan[plan] : '';
  const teachSeed = teaching && typeof cfg.teaching === 'string' ? cfg.teaching : '';

  if (fmtSeed) parts.push(fmtSeed);
  if (planSeed) parts.push(planSeed);
  if (teachSeed) parts.push(teachSeed);

  // Fallback to static hints if any slot is empty
  const merged = [parts.join('\n'), base.seed].filter(Boolean).join('\n');
  return { id: base.id, seed: merged };
}
