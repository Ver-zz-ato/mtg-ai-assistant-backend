const REDDIT_UA =
  process.env.MARKETING_RADAR_REDDIT_UA ||
  "ManaTapMarketingRadar/1.0 (admin signal analysis; +https://manatap.ai)";

let cachedToken: { value: string; expiresAtMs: number } | null = null;

export function isRedditApiConfigured(): boolean {
  return (
    !!String(process.env.REDDIT_CLIENT_ID || "").trim() &&
    !!String(process.env.REDDIT_CLIENT_SECRET || "").trim()
  );
}

export function redditUserAgent(): string {
  return REDDIT_UA;
}

/** Application-only OAuth (client_credentials) for read-only public subreddit data. */
export async function getRedditAccessToken(): Promise<string | null> {
  const clientId = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_UA,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Reddit OAuth ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  const token = json.access_token;
  if (!token) throw new Error("Reddit OAuth: missing access_token");

  const expiresInSec = Math.max(60, Number(json.expires_in ?? 3600));
  cachedToken = { value: token, expiresAtMs: now + expiresInSec * 1000 };
  return token;
}
