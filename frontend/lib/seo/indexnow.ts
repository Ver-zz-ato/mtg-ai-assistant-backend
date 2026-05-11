import { BASE_URL } from "@/lib/seo/constants";

export type IndexNowResult = {
  ok: boolean;
  submittedCount: number;
  skippedCount: number;
  status: number | null;
  message: string;
  batches?: Array<{ ok: boolean; status: number; submittedCount: number; message: string }>;
};

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const CANONICAL_HOST = "www.manatap.ai";
const MAX_URLS_PER_REQUEST = 10_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const EXCLUDED_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/login",
  "/logout",
  "/account",
  "/profile",
  "/my-decks",
  "/settings",
  "/billing",
  "/checkout",
  "/thank-you",
];

function configuredBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || BASE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === CANONICAL_HOST) return parsed;
  } catch {}
  return new URL(BASE_URL);
}

export function getIndexNowKey(): string | null {
  const key = (process.env.INDEXNOW_KEY || "").trim();
  return KEY_PATTERN.test(key) ? key : null;
}

export function getIndexNowKeyLocation(): string | null {
  const key = getIndexNowKey();
  if (!key) return null;
  return `${BASE_URL}/${key}.txt`;
}

function isEnabled(): boolean {
  const raw = process.env.INDEXNOW_ENABLED;
  if (raw && /^(0|false|no|off)$/i.test(raw.trim())) return false;
  if (raw && /^(1|true|yes|on)$/i.test(raw.trim())) return true;
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function isPrivateOrNonIndexablePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return EXCLUDED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function normalizeIndexNowUrls(input: string[] | string): { urls: string[]; skippedCount: number } {
  const values = Array.isArray(input) ? input : [input];
  const base = configuredBaseUrl();
  const seen = new Set<string>();
  let skippedCount = 0;

  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) {
      skippedCount += 1;
      continue;
    }

    try {
      const parsed = new URL(raw, base);
      const host = parsed.hostname.toLowerCase();
      if (host !== CANONICAL_HOST && host !== "manatap.ai") {
        skippedCount += 1;
        continue;
      }
      parsed.hash = "";
      parsed.search = "";
      parsed.protocol = "https:";
      parsed.hostname = CANONICAL_HOST;
      parsed.port = "";

      if (parsed.username || parsed.password) {
        skippedCount += 1;
        continue;
      }
      if (isPrivateOrNonIndexablePath(parsed.pathname)) {
        skippedCount += 1;
        continue;
      }
      if (parsed.pathname.includes("//")) {
        skippedCount += 1;
        continue;
      }

      const normalized = parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "" : "/");
      seen.add(normalized);
    } catch {
      skippedCount += 1;
    }
  }

  const duplicateCount = Math.max(0, values.length - skippedCount - seen.size);
  return { urls: [...seen], skippedCount: skippedCount + duplicateCount };
}

function chunkUrls(urls: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    chunks.push(urls.slice(i, i + MAX_URLS_PER_REQUEST));
  }
  return chunks;
}

export async function submitToIndexNow(input: string[] | string): Promise<IndexNowResult> {
  const { urls, skippedCount } = normalizeIndexNowUrls(input);
  const key = getIndexNowKey();
  const keyLocation = getIndexNowKeyLocation();

  if (!urls.length) {
    return { ok: true, submittedCount: 0, skippedCount, status: null, message: "No valid public URLs to submit." };
  }
  if (!isEnabled()) {
    return { ok: true, submittedCount: 0, skippedCount: skippedCount + urls.length, status: null, message: "IndexNow disabled." };
  }
  if (!key || !keyLocation) {
    console.warn("[indexnow] INDEXNOW_KEY must be a 32-character key before submissions can run.");
    return { ok: false, submittedCount: 0, skippedCount: skippedCount + urls.length, status: null, message: "INDEXNOW_KEY missing or invalid." };
  }

  const batches: NonNullable<IndexNowResult["batches"]> = [];
  let submittedCount = 0;
  let lastStatus: number | null = null;

  for (const batch of chunkUrls(urls)) {
    try {
      // eslint-disable-next-line no-restricted-globals -- IndexNow requires a direct POST to the external protocol endpoint.
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: CANONICAL_HOST,
          key,
          keyLocation,
          urlList: batch,
        }),
      });
      lastStatus = res.status;
      const text = await res.text().catch(() => "");
      const message = text.trim() || res.statusText || `HTTP ${res.status}`;
      const ok = res.status >= 200 && res.status < 300;
      if (ok) submittedCount += batch.length;
      else console.warn("[indexnow] submission failed", { status: res.status, message });
      batches.push({ ok, status: res.status, submittedCount: ok ? batch.length : 0, message });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[indexnow] submission failed", message);
      batches.push({ ok: false, status: 0, submittedCount: 0, message });
    }
  }

  const ok = batches.every((batch) => batch.ok);
  return {
    ok,
    submittedCount,
    skippedCount,
    status: lastStatus,
    message: ok ? "IndexNow submission accepted." : "One or more IndexNow batches failed.",
    batches,
  };
}
