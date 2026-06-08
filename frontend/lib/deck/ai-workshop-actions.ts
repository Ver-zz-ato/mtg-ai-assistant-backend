export const TRANSFORM_INTENT = {
  GENERAL: "general",
  IMPROVE_MANA_BASE: "improve_mana_base",
  TIGHTEN_CURVE: "tighten_curve",
  ADD_INTERACTION: "add_interaction",
  LOWER_BUDGET: "lower_budget",
  MORE_CASUAL: "more_casual",
  MORE_OPTIMIZED: "more_optimized",
  FIX_LEGALITY: "fix_legality",
} as const;

export type WorkshopAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  intent: string;
  defaultNotes: string;
};

export const WORKSHOP_ACTIONS: WorkshopAction[] = [
  {
    id: "general",
    title: "General cleanup",
    subtitle: "Smooth weak slots.",
    icon: "sparkles",
    intent: TRANSFORM_INTENT.GENERAL,
    defaultNotes:
      "Keep the deck recognizable. Clean up low-impact cards, improve cohesion, and preserve the main plan.",
  },
  {
    id: "mana",
    title: "Mana base",
    subtitle: "Fix lands/ramp.",
    icon: "droplets",
    intent: TRANSFORM_INTENT.IMPROVE_MANA_BASE,
    defaultNotes: "Focus on lands, fixing, and ramp quality. Keep the deck strategy intact.",
  },
  {
    id: "curve",
    title: "Curve",
    subtitle: "Smooth early game.",
    icon: "chart-line",
    intent: TRANSFORM_INTENT.TIGHTEN_CURVE,
    defaultNotes: "Lower clunky mana costs where possible and improve playability in the first four turns.",
  },
  {
    id: "interaction",
    title: "Interaction",
    subtitle: "Add answers.",
    icon: "shield",
    intent: TRANSFORM_INTENT.ADD_INTERACTION,
    defaultNotes:
      "Add more useful removal, stack interaction, or flexible answers while keeping the deck on-theme.",
  },
  {
    id: "budget",
    title: "Lower budget",
    subtitle: "Cheaper swaps.",
    icon: "coins",
    intent: TRANSFORM_INTENT.LOWER_BUDGET,
    defaultNotes: "Prefer budget-conscious replacements that preserve the strategy and play pattern.",
  },
  {
    id: "optimized",
    title: "Raise power",
    subtitle: "Stronger lines.",
    icon: "swords",
    intent: TRANSFORM_INTENT.MORE_OPTIMIZED,
    defaultNotes: "Improve consistency, trim weaker cards, and optimize toward a sharper end result.",
  },
  {
    id: "casual",
    title: "Make more casual",
    subtitle: "Softer gameplay.",
    icon: "heart",
    intent: TRANSFORM_INTENT.MORE_CASUAL,
    defaultNotes: "Keep the deck fun and multiplayer-friendly. Avoid overly oppressive lines where possible.",
  },
  {
    id: "legality",
    title: "Fix legality",
    subtitle: "Repair format issues.",
    icon: "badge-check",
    intent: TRANSFORM_INTENT.FIX_LEGALITY,
    defaultNotes: "Prioritize legality, format correctness, and clean deck structure.",
  },
];

export const WORKSHOP_FORMATS = ["Commander", "Modern", "Pioneer", "Standard", "Pauper"] as const;

export const AI_WORKSHOP_HANDOFF_KEY = "ai_workshop_handoff";

export type AiWorkshopHandoff = {
  deckText: string;
  format: string;
  commander?: string;
  title?: string;
  sourceLabel?: string;
};
