import { MARKETING_SITE_BASE } from "./marketingPublicLinks";

export type MarketingUtmPlatform = "x" | "instagram" | "blog";

export function buildCampaignSlug(briefDate: string): string {
  const date = briefDate.slice(0, 10);
  return `radar-${date}`;
}

export function appendMarketingUtm(
  url: string,
  opts: { platform: MarketingUtmPlatform; campaign: string }
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes("manatap.ai")) return trimmed;

  parsed.searchParams.set("utm_source", opts.platform);
  parsed.searchParams.set("utm_medium", "social");
  parsed.searchParams.set("utm_campaign", opts.campaign);
  parsed.searchParams.set("utm_content", opts.platform);

  return parsed.toString();
}

const MANATAP_URL_RE = /https?:\/\/(?:www\.)?manatap\.ai[^\s)\]"']*/gi;

export function applyUtmToDraftContent(
  content: string,
  platform: MarketingUtmPlatform,
  campaign: string
): string {
  return content.replace(MANATAP_URL_RE, (match) =>
    appendMarketingUtm(match, { platform, campaign })
  );
}

/** Path segment after origin for CTA match checks, e.g. /budget-swaps */
export function primaryCtaPath(landingUrl: string): string {
  try {
    const u = new URL(landingUrl);
    const baseHost = new URL(MARKETING_SITE_BASE).hostname.toLowerCase();
    if (u.hostname.toLowerCase() !== baseHost && !u.hostname.toLowerCase().endsWith("manatap.ai")) {
      return "/";
    }
    const path = u.pathname.replace(/\/$/, "") || "/";
    return path;
  } catch {
    return "/";
  }
}

export function contentIncludesCtaPath(content: string, path: string): boolean {
  if (path === "/" || path === "") {
    return /manatap\.ai\/?(?:\?|"|'|\s|$)/i.test(content);
  }
  return content.toLowerCase().includes(path.toLowerCase());
}
