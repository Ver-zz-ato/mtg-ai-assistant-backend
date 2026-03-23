/**
 * Simple semver-ish compare for app version strings (major.minor.patch).
 * Ignores prerelease suffix for comparison when possible.
 */

function parseParts(v: string): number[] | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const core = s.split(/[-+]/)[0] ?? s;
  const parts = core.split(".").map((p) => parseInt(p.replace(/\D/g, ""), 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 4);
}

/** -1 if a < b, 0 if equal, 1 if a > b */
export function compareSemver(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/** True if constraints allow `version` (both min/max optional). */
export function versionInRange(
  version: string | null | undefined,
  minApp: string | null | undefined,
  maxApp: string | null | undefined
): boolean {
  if (!version || !String(version).trim()) return true;
  const v = String(version).trim();
  if (minApp && String(minApp).trim() && compareSemver(v, String(minApp).trim()) < 0) return false;
  if (maxApp && String(maxApp).trim() && compareSemver(v, String(maxApp).trim()) > 0) return false;
  return true;
}
