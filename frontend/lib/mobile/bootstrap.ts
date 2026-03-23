import type { SupabaseClient } from "@supabase/supabase-js";
import { tierLimitsSchema, type TierLimits } from "@/lib/mobile/validation";
import { versionInRange } from "@/lib/mobile/semver-compare";

function shouldIncludeByVersion(
  version: string | null | undefined,
  minApp: string | null | undefined,
  maxApp: string | null | undefined
): boolean {
  const hasConstraint =
    !!(minApp && String(minApp).trim()) || !!(maxApp && String(maxApp).trim());
  if (hasConstraint && (!version || !String(version).trim())) return false;
  return versionInRange(version, minApp, maxApp);
}

export type BootstrapPlatform = "all" | "mobile" | "ios" | "android" | "web";

export type MobileBootstrapPayload = {
  ok: true;
  generatedAt: string;
  featureFlags: Record<string, { enabled: boolean; value: Record<string, unknown> }>;
  remoteConfig: Record<string, unknown>;
  tierLimits: TierLimits;
  whatsNew: Array<{
    title: string;
    body: string;
    platform: string;
    minAppVersion: string | null;
    maxAppVersion: string | null;
    priority: number;
  }>;
};

function normalizePlatform(p: string | null | undefined): BootstrapPlatform {
  const x = String(p || "mobile").toLowerCase();
  if (x === "all" || x === "mobile" || x === "ios" || x === "android" || x === "web") return x;
  return "mobile";
}

/** Include row if platform column matches query rules. */
export function platformMatchesRow(
  rowPlatform: string,
  requested: BootstrapPlatform
): boolean {
  const rp = String(rowPlatform || "all").toLowerCase();
  if (rp === "all") return true;
  if (requested === "all") return rp === "all";
  if (requested === rp) return true;
  if ((requested === "ios" || requested === "android") && rp === "mobile") return true;
  if (requested === "mobile" && (rp === "ios" || rp === "android" || rp === "mobile")) return true;
  return false;
}

function changelogPlatformMatches(rowPlatform: string, requested: BootstrapPlatform): boolean {
  const rp = String(rowPlatform || "mobile").toLowerCase();
  if (rp === "all") return true;
  if (requested === "all") return rp === "all" || rp === "mobile";
  if (rp === requested) return true;
  if ((requested === "ios" || requested === "android") && (rp === "mobile" || rp === "all")) return true;
  if (requested === "mobile" && (rp === "mobile" || rp === "ios" || rp === "android" || rp === "all")) return true;
  return false;
}

const DEFAULT_TIERS: TierLimits = {
  guest: { chatPerDay: 3, deckAnalysisPerDay: 2, roastPerDay: 1 },
  free: { chatPerDay: 10, deckAnalysisPerDay: 5, roastPerDay: 3 },
  pro: { chatPerDay: -1, deckAnalysisPerDay: -1, roastPerDay: -1 },
};

export async function buildMobileBootstrapPayload(
  admin: SupabaseClient,
  opts: { platform?: string | null; version?: string | null }
): Promise<MobileBootstrapPayload> {
  const platform = normalizePlatform(opts.platform);
  const version = opts.version?.trim() || null;
  const now = new Date().toISOString();

  const [{ data: flagRows, error: flagErr }, { data: configRows, error: cfgErr }, { data: logRows, error: logErr }] =
    await Promise.all([
      admin.from("feature_flags").select("key, enabled, value, platform"),
      admin.from("remote_config").select("key, value, platform"),
      admin
        .from("app_changelog")
        .select(
          "title, body, platform, min_app_version, max_app_version, priority, is_active, starts_at, ends_at"
        )
        .eq("is_active", true)
        .order("priority", { ascending: true }),
    ]);

  if (flagErr) throw new Error(flagErr.message);
  if (cfgErr) throw new Error(cfgErr.message);
  if (logErr) throw new Error(logErr.message);

  const featureFlags: MobileBootstrapPayload["featureFlags"] = {};
  for (const row of flagRows || []) {
    const r = row as {
      key: string;
      enabled: boolean;
      value: unknown;
      platform: string;
    };
    if (!platformMatchesRow(r.platform, platform)) continue;
    const val =
      r.value && typeof r.value === "object" && !Array.isArray(r.value)
        ? (r.value as Record<string, unknown>)
        : {};
    featureFlags[r.key] = { enabled: !!r.enabled, value: val };
  }

  const remoteConfig: Record<string, unknown> = {};
  for (const row of configRows || []) {
    const r = row as { key: string; value: unknown; platform: string };
    if (!platformMatchesRow(r.platform, platform)) continue;
    remoteConfig[r.key] = r.value;
  }

  let tierLimits: TierLimits = DEFAULT_TIERS;
  const rawTiers = remoteConfig["mobile.tiers.limits"];
  const parsed = tierLimitsSchema.safeParse(rawTiers);
  if (parsed.success) tierLimits = parsed.data;

  const whatsNew: MobileBootstrapPayload["whatsNew"] = [];
  const tnow = Date.now();
  for (const row of logRows || []) {
    const r = row as {
      title: string;
      body: string;
      platform: string;
      min_app_version: string | null;
      max_app_version: string | null;
      priority: number;
      is_active: boolean;
      starts_at: string | null;
      ends_at: string | null;
    };
    if (!changelogPlatformMatches(r.platform, platform)) continue;
    if (r.starts_at) {
      const s = new Date(r.starts_at).getTime();
      if (!Number.isNaN(s) && s > tnow) continue;
    }
    if (r.ends_at) {
      const e = new Date(r.ends_at).getTime();
      if (!Number.isNaN(e) && e < tnow) continue;
    }
    if (!shouldIncludeByVersion(version, r.min_app_version, r.max_app_version)) continue;
    whatsNew.push({
      title: r.title,
      body: r.body,
      platform: r.platform,
      minAppVersion: r.min_app_version,
      maxAppVersion: r.max_app_version,
      priority: r.priority,
    });
  }

  return {
    ok: true,
    generatedAt: now,
    featureFlags,
    remoteConfig,
    tierLimits,
    whatsNew,
  };
}
