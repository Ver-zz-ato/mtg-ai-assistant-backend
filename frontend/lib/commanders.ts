/**
 * Single source of truth for Commander SEO content.
 * Commanders are ordered by presumed popularity (stable). Cap is soft — raise MAX_COMMANDERS as the catalog grows.
 */

import commanderProfiles from "@/lib/data/commander_profiles.json";
import { EXTRA_COMMANDER_PROFILES } from "@/lib/data/commander-extra-profiles";

/** Soft cap for bundled catalog size (profiles JSON + extra list). Easy to raise without code churn elsewhere. */
export const MAX_COMMANDERS = 100;

/** Hub depth: flagship = curated premium showcase; full/enhanced = richer than standard; basic = lighter hub. */
export type GuideTier = "flagship" | "full" | "enhanced" | "standard" | "basic";

/** Optional premium fields in commander_profiles.json — only for flagship-tier entries. */
export type FlagshipGuideContent = {
  loveReason?: string;
  bestFor?: string;
  winPaths?: string[];
  traps?: string[];
  upgradePriority?: string[];
  openingPlan?: string[];
  tableReputation?: string;
  communityHeadline?: string;
  communitySubhead?: string;
};

export type CommanderProfile = {
  slug: string;
  name: string;
  colors?: string[];
  tags?: string[];
  blurb?: string;
  /** Longer coaching notes from commander_profiles.json — used for strengths/upgrades when present. */
  coachNotes?: string;
  /** “Avoid” pitfalls from JSON — used for weaknesses copy when present. */
  avoid?: string[];
  /** Content depth hint for mobile/Discover (default: standard templated hub). */
  guideTier?: GuideTier;
  /** Surface in Discover “featured” ordering when true. */
  featuredGuide?: boolean;
  /** When false, omitted from mobile guide catalog (API list). */
  hasGuide?: boolean;
  /** Present when guideTier is flagship — editorial modules for premium guides. */
  flagship?: FlagshipGuideContent;
};

/** Convert commander name to URL-safe slug */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Infer color identity from commander name (known commanders) */
const COLOR_MAP: Record<string, string[]> = {
  "theurdragon": ["W", "U", "B", "R", "G"],
  "theur-dragon": ["W", "U", "B", "R", "G"], // legacy key
  "edgarmarkov": ["W", "B", "R"],
  "atraxapraetorsvoice": ["W", "U", "B", "G"],
  "krenkomobboss": ["R"],
  "kaaliaofthevast": ["W", "B", "R"],
  "pantlazasunfavored": ["W", "G", "R"],
  "sauronthedarklord": ["U", "B", "R"],
  "yurikothetigersshadow": ["U", "B"],
  "lathrilbladeoftheelves": ["B", "G"],
  "kenriththereturnedking": ["W", "U", "B", "R", "G"],
  "giadafontofhope": ["W"],
  "jodahtheunifier": ["W", "U", "B", "R", "G"],
  "miirymsentinelwyrm": ["U", "R", "G"],
  "thewisemothman": ["U", "B", "G"],
  "nekusarthemindrazer": ["U", "B", "R"],
  "yshtolanightsblessed": ["W", "U", "R"],
  "isshintwoheavensasone": ["W", "B", "R"],
  "hakbalofthesurgingsoul": ["U", "G"],
  "ulalekfusedatrocity": [], // colorless
  "msbumbleflower": ["W", "U", "G"],
  "muldrothathegravetide": ["U", "B", "G"],
  "merenofclanneltoth": ["B", "G"],
  "teysakarlov": ["W", "B"],
  "breyatheetheriumshaper": ["W", "U", "B", "R"],
  "rhystheredeemed": ["G", "W"],
  "sythisharvestshand": ["G", "W"],
  "osgirthereconstructor": ["W", "R"],
  "esixfractalbloom": ["U", "G"],
  "wilhelttherotcleaver": ["W", "B"],
  "korvoldfaecursedking": ["B", "R", "G"],
  "chulanetelleroftales": ["W", "U", "G"],
  "krenkotinstreetkingpin": ["R"],
  "etaliprimalstorm": ["R"],
  "xyristhewrithestorm": ["U", "R", "G"],
  "tivitsellerofsecrets": ["W", "U", "B"],
  "prosshskyraiderofkher": ["B", "R", "G"],
  "aesityrantofthegyrestrait": ["U", "G"],
  "bragokingeternal": ["W", "U"],
  "teferitemporalarchmage": ["U"],
  "dereviempyrialtactician": ["W", "U", "G"],
  "gishathsunsavatar": ["R", "G", "W"],
  "maelstromwanderer": ["U", "R", "G"],
  "sliveroverlord": ["W", "U", "B", "R", "G"],
  "thefirstsliver": ["W", "U", "B", "R", "G"],
  "narsetenlightenedmaster": ["U", "R", "W"],
  "xenagosgodofrevels": ["R", "G"],
  "omnathlocusofcreation": ["W", "U", "R", "G"],
  "omnathlocusofrage": ["R", "G"],
  "aragorntheunifier": ["W", "U", "B", "R", "G"],
  "roccocabaretticaterer": ["W", "R", "G"],
  "myrathemagnificent": ["U", "R"],
};

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Build COMMANDERS from profiles + extended list */
function buildCommanders(): CommanderProfile[] {
  const profiles = commanderProfiles as Record<
    string,
    {
      plan?: string;
      preferTags?: string[];
      notes?: string;
      avoid?: string[];
      guideTier?: GuideTier;
      featuredGuide?: boolean;
      flagship?: FlagshipGuideContent;
    }
  >;
  const fromProfiles = Object.entries(profiles).map(([name, p]) => ({
    slug: toSlug(name),
    name,
    colors: COLOR_MAP[norm(name)] ?? undefined,
    tags: p.preferTags ?? undefined,
    blurb: p.plan ?? undefined,
    coachNotes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : undefined,
    avoid: Array.isArray(p.avoid) && p.avoid.length ? p.avoid : undefined,
    ...(p.guideTier ? { guideTier: p.guideTier } : {}),
    ...(p.featuredGuide === true ? { featuredGuide: true } : {}),
    ...(p.flagship && typeof p.flagship === "object" ? { flagship: p.flagship } : {}),
  }));

  // Additional commanders not yet present in commander_profiles.json.
  const extraProfiles: CommanderProfile[] = Object.entries(EXTRA_COMMANDER_PROFILES)
    .filter(([name]) => !profiles[name])
    .map(([name, p]) => ({
      slug: toSlug(name),
      name,
      colors: COLOR_MAP[norm(name)] ?? undefined,
      tags: p.preferTags ?? undefined,
      blurb: p.plan ?? undefined,
      coachNotes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : undefined,
      avoid: Array.isArray(p.avoid) && p.avoid.length ? p.avoid : undefined,
      ...(p.guideTier ? { guideTier: p.guideTier } : {}),
      ...(p.featuredGuide === true ? { featuredGuide: true } : {}),
      ...(p.flagship && typeof p.flagship === "object" ? { flagship: p.flagship } : {}),
    }));

  return [...fromProfiles, ...extraProfiles].slice(0, MAX_COMMANDERS);
}

export const COMMANDERS: CommanderProfile[] = buildCommanders();

export function getCommanderBySlug(slug: string): CommanderProfile | null {
  return COMMANDERS.find((c) => c.slug === slug) ?? null;
}

/** Get commander slug from display name (for deck→commander links). */
export function getCommanderSlugByName(name: string): string | null {
  const clean = String(name || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!clean) return null;
  const found = COMMANDERS.find((c) => norm(c.name) === norm(clean));
  return found?.slug ?? null;
}

/** Curated commander profile by display name (case/punctuation insensitive). */
export function getCommanderProfileByName(name: string): CommanderProfile | null {
  const clean = String(name || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!clean) return null;
  return COMMANDERS.find((c) => norm(c.name) === norm(clean)) ?? null;
}

export function getCommanderCatalogSlugs(): string[] {
  return COMMANDERS.map((c) => c.slug);
}

/** @deprecated Use {@link getCommanderCatalogSlugs} */
export function getFirst50CommanderSlugs(): string[] {
  return getCommanderCatalogSlugs();
}

/** Get recently updated commanders from commander_aggregates (for Recent updates block). */
export async function getRecentlyUpdatedCommanders(limit = 10): Promise<Array<{ slug: string; name: string; updated_at: string }>> {
  const slugs = getCommanderCatalogSlugs();
  try {
    const { createClientForStatic } = await import("@/lib/server-supabase");
    const supabase = createClientForStatic();
    const { data } = await supabase
      .from("commander_aggregates")
      .select("commander_slug, updated_at")
      .in("commander_slug", slugs)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return (data || []).map((row) => {
      const r = row as { commander_slug: string; updated_at: string };
      const profile = getCommanderBySlug(r.commander_slug);
      return {
        slug: r.commander_slug,
        name: profile?.name ?? r.commander_slug,
        updated_at: r.updated_at || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

/** For sitemap: get commander slugs with updated_at from commander_aggregates. */
export async function getCommanderSlugsWithUpdatedAt(): Promise<Array<{ slug: string; updated_at: string }>> {
  const slugs = getCommanderCatalogSlugs();
  try {
    const { createClientForStatic } = await import("@/lib/server-supabase");
    const supabase = createClientForStatic();
    const { data } = await supabase
      .from("commander_aggregates")
      .select("commander_slug, updated_at")
      .in("commander_slug", slugs);
    const bySlug = new Map<string, string>();
    for (const row of data || []) {
      const r = row as { commander_slug: string; updated_at: string };
      if (r.commander_slug && r.updated_at) bySlug.set(r.commander_slug, r.updated_at);
    }
    const now = new Date().toISOString();
    return slugs.map((slug) => ({
      slug,
      updated_at: bySlug.get(slug) || now,
    }));
  } catch {
    const now = new Date().toISOString();
    return slugs.map((slug) => ({ slug, updated_at: now }));
  }
}
