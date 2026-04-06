/**
 * Auth for `/api/cron/mtg-legality-refresh` only.
 * Requires a configured secret; does not trust x-vercel-id (spoofable / present on many requests).
 *
 * Vercel scheduled crons: set CRON_SECRET in the project; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * Manual / admin proxy: `x-cron-key` or `?key=` matching CRON_KEY, CRON_SECRET, or RENDER_CRON_SECRET.
 */
import { timingSafeEqual } from "node:crypto";

const ENV_SECRET_KEYS = ["CRON_KEY", "CRON_SECRET", "RENDER_CRON_SECRET"] as const;

export function getMtgLegalityCronSecrets(): string[] {
  const out: string[] = [];
  for (const k of ENV_SECRET_KEYS) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out.push(v);
  }
  return out;
}

function matchesAnySecret(candidate: string, secrets: string[]): boolean {
  if (!candidate) return false;
  const buf = Buffer.from(candidate, "utf8");
  for (const s of secrets) {
    const sb = Buffer.from(s, "utf8");
    if (buf.length !== sb.length) continue;
    if (timingSafeEqual(buf, sb)) return true;
  }
  return false;
}

export function isMtgLegalityCronAuthorized(
  secrets: string[],
  opts: {
    authorizationHeader: string | null;
    xCronKey: string | null;
    queryKey: string | null;
  }
): boolean {
  if (secrets.length === 0) return false;

  const auth = (opts.authorizationHeader ?? "").trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(auth);
  const bearer = (bearerMatch?.[1] ?? "").trim();
  if (bearer && matchesAnySecret(bearer, secrets)) return true;

  const hdr = (opts.xCronKey ?? "").trim();
  if (hdr && matchesAnySecret(hdr, secrets)) return true;

  const q = (opts.queryKey ?? "").trim();
  if (q && matchesAnySecret(q, secrets)) return true;

  return false;
}
