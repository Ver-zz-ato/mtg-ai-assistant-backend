export type PreviewFacts = Record<string, unknown> | null | undefined;

export type AiBuildPreviewStats = {
  lands?: number;
  ramp?: number;
  draw?: number;
  interaction?: number;
  totalCards?: number;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function previewFactsToStats(facts: PreviewFacts): Partial<AiBuildPreviewStats> | null {
  if (!facts || typeof facts !== "object") return null;
  const f = facts as Record<string, unknown>;
  const pick = (keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = num(f[k]);
      if (v !== undefined) return Math.round(v);
    }
    return undefined;
  };
  const lands = pick(["lands", "landCount", "landsCount"]);
  const ramp = pick(["ramp", "rampCount"]);
  const draw = pick(["draw", "drawCount"]);
  const interaction = pick(["interaction", "interactionCount", "removal", "removalCount"]);
  const totalCards = pick(["totalCards", "total", "cardCount", "cards"]);
  const out: Partial<AiBuildPreviewStats> = {};
  if (lands !== undefined) out.lands = lands;
  if (ramp !== undefined) out.ramp = ramp;
  if (draw !== undefined) out.draw = draw;
  if (interaction !== undefined) out.interaction = interaction;
  if (totalCards !== undefined) out.totalCards = totalCards;
  return Object.keys(out).length > 0 ? out : null;
}

export function previewFactsStrengthsRisks(
  facts: PreviewFacts,
): { strengths: string[]; risks: string[] } {
  if (!facts || typeof facts !== "object") return { strengths: [], risks: [] };
  const f = facts as Record<string, unknown>;
  const str = f.strengths ?? f.strength;
  const risk = f.risks ?? f.risk ?? f.weaknesses;
  const strengths = Array.isArray(str) ? str.filter((x): x is string => typeof x === "string") : [];
  const risks = Array.isArray(risk) ? risk.filter((x): x is string => typeof x === "string") : [];
  return { strengths, risks };
}

export function transformStatsOneLiner(facts: PreviewFacts): string | null {
  const stats = previewFactsToStats(facts ?? undefined);
  if (!stats) return null;
  const bits: string[] = [];
  if (stats.totalCards != null) bits.push(`~${stats.totalCards} cards`);
  if (stats.lands != null) bits.push(`~${stats.lands} lands`);
  if (stats.ramp != null) bits.push(`~${stats.ramp} ramp`);
  if (stats.draw != null) bits.push(`~${stats.draw} draw`);
  return bits.length ? bits.join(" · ") : null;
}
