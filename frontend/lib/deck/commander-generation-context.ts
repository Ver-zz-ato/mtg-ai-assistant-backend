/**
 * Commander guide + official precon role hints for collection deck generation prompts.
 * Best-effort: missing profile or DB rows must not block generation.
 */

import { getCommanderProfileByName, type CommanderProfile } from "@/lib/commanders";
import { buildDeckContextSummary, type DeckContextSummary } from "@/lib/deck/deck-context-summary";
import { getAdmin } from "@/lib/supa";

type PreconRow = {
  name: string;
  set_name: string | null;
  release_year: number | null;
  deck_text: string;
  colors: string[] | null;
};

function formatProfileBlock(profile: CommanderProfile, commanderName: string): string[] {
  const lines: string[] = [`Commander: ${profile.name || commanderName}`];
  if (profile.blurb?.trim()) lines.push(`Plan: ${profile.blurb.trim()}`);
  if (profile.tags?.length) lines.push(`Strategy tags: ${profile.tags.join(", ")}`);
  if (profile.coachNotes?.trim()) lines.push(`Coach notes: ${profile.coachNotes.trim()}`);
  if (profile.avoid?.length) lines.push(`Avoid: ${profile.avoid.join("; ")}`);
  const fs = profile.flagship;
  if (fs?.winPaths?.length) lines.push(`Win paths: ${fs.winPaths.join("; ")}`);
  if (fs?.upgradePriority?.length) lines.push(`Upgrade priorities: ${fs.upgradePriority.join("; ")}`);
  if (fs?.traps?.length) lines.push(`Common traps: ${fs.traps.join("; ")}`);
  if (fs?.openingPlan?.length) lines.push(`Opening plan: ${fs.openingPlan.join("; ")}`);
  return lines;
}

export function formatDeckContextSummaryHint(label: string, summary: DeckContextSummary): string {
  const tags = summary.archetype_tags?.length ? summary.archetype_tags.slice(0, 8).join(", ") : "";
  const warnings = summary.warning_flags?.length ? summary.warning_flags.slice(0, 4).join(", ") : "";
  return [
    `${label} structure targets:`,
    `lands ${summary.land_count}, ramp ${summary.ramp}, draw ${summary.draw}, removal ${summary.removal}, wipes ${summary.board_wipes}`,
    tags ? `archetype tags: ${tags}` : "",
    warnings ? `notes: ${warnings}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function fetchRecentPreconsForCommander(commanderName: string, limit = 2): Promise<PreconRow[]> {
  const clean = commanderName.trim();
  if (!clean) return [];
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("precon_decks")
      .select("name, set_name, release_year, deck_text, colors")
      .ilike("commander", `%${clean}%`)
      .order("release_year", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.warn("[commander-generation-context] precon query failed", error.message);
      return [];
    }
    return (data ?? []) as PreconRow[];
  } catch (e) {
    console.warn("[commander-generation-context] precon query error", e);
    return [];
  }
}

/**
 * Compact reference block appended to collection Commander generation user prompts.
 */
export async function buildCommanderReferencePromptBlock(commanderName: string): Promise<string> {
  const clean = commanderName.trim();
  if (!clean) return "";

  const lines: string[] = [
    "--- Commander reference (deck-building hints; owned collection still wins) ---",
  ];

  const profile = getCommanderProfileByName(clean);
  if (profile) {
    lines.push(...formatProfileBlock(profile, clean));
  } else {
    lines.push(`Commander: ${clean}`);
    lines.push("(No curated guide profile — infer strategy from commander text and collection.)");
  }

  const precons = await fetchRecentPreconsForCommander(clean, 2);
  for (const precon of precons) {
    const deckText = String(precon.deck_text || "").trim();
    if (!deckText) continue;
    try {
      const summary = await buildDeckContextSummary(deckText, {
        format: "Commander",
        commander: clean,
        colors: precon.colors ?? profile?.colors ?? [],
      });
      const setLabel = [precon.set_name, precon.release_year].filter(Boolean).join(" ");
      const label = setLabel
        ? `Official precon "${precon.name}" (${setLabel})`
        : `Official precon "${precon.name}"`;
      lines.push(formatDeckContextSummaryHint(label, summary));
    } catch (e) {
      console.warn("[commander-generation-context] precon summary failed", precon.name, e);
    }
  }

  if (precons.length === 0) {
    lines.push("(No matching official precon in catalog — use commander identity and collection.)");
  }

  lines.push(
    "Use these hints for land/ramp/draw/removal balance and on-theme synergies; prefer owned cards and do not copy precon lists card-for-card.",
  );

  return lines.join("\n");
}
