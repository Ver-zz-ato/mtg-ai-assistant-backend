const REDDIT_UA =
  process.env.MARKETING_RADAR_REDDIT_UA ||
  "ManaTapMarketingRadar/1.0 (admin signal analysis; +https://manatap.ai)";

let cachedToken: { value: string; expiresAtMs: number } | null = null;

export function redditUserAgent(): string {
  return REDDIT_UA;
}

export function isRedditApiConfigured(): boolean {
  return (
    !!String(process.env.REDDIT_CLIENT_ID || "").trim() &&
    !!String(process.env.REDDIT_CLIENT_SECRET || "").trim() &&
    !!String(process.env.REDDIT_USERNAME || "").trim() &&
    !!String(process.env.REDDIT_PASSWORD || "").trim()
  );
}

export function isRedditPartiallyConfigured(): boolean {
  const hasId = !!String(process.env.REDDIT_CLIENT_ID || "").trim();
  const hasSecret = !!String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  const hasUser = !!String(process.env.REDDIT_USERNAME || "").trim();
  const hasPass = !!String(process.env.REDDIT_PASSWORD || "").trim();
  return (hasId || hasSecret || hasUser || hasPass) && !isRedditApiConfigured();
}

async function requestToken(body: string): Promise<{ access_token: string; expires_in?: number }> {
  const clientId = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_UA,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Reddit OAuth ${res.status}: ${text.slice(0, 240)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) {
    throw new Error(json.error ? `Reddit OAuth: ${json.error}` : "Reddit OAuth: missing access_token");
  }
  return { access_token: json.access_token, expires_in: json.expires_in };
}

/**
 * Script-app password grant (Reddit's current Data API flow for automated read access).
 * Falls back to client_credentials only when username/password are not set.
 */
export async function getRedditAccessToken(): Promise<string | null> {
  const clientId = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;

  const username = String(process.env.REDDIT_USERNAME || "").trim();
  const password = String(process.env.REDDIT_PASSWORD || "").trim();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.value;
  }

  const tokenRes =
    username && password
      ? await requestToken(
          new URLSearchParams({
            grant_type: "password",
            username,
            password,
          }).toString()
        )
      : await requestToken("grant_type=client_credentials");

  const expiresInSec = Math.max(60, Number(tokenRes.expires_in ?? 3600));
  cachedToken = { value: tokenRes.access_token, expiresAtMs: now + expiresInSec * 1000 };
  return tokenRes.access_token;
}
