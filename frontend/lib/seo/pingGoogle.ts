/**
 * Ping Google to notify of sitemap updates.
 * Call after bulk imports, blog publish, or major content updates.
 * Fails silently - does not crash build or throw.
 */

const SITEMAP_URL = "https://www.manatap.ai/sitemap.xml";
const PING_URL = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;

export async function pingGoogleSitemap(): Promise<void> {
  try {
    const res = await fetch(PING_URL, {
      method: "GET",
      headers: { "User-Agent": "ManaTap-AI/1.0" },
      cache: "no-store",
    });
    if (res.ok) {
      console.log("[pingGoogleSitemap] Success - Google notified of sitemap update");
    } else {
      console.warn("[pingGoogleSitemap] Non-200 response:", res.status);
    }
  } catch (e) {
    console.warn("[pingGoogleSitemap] Failed silently:", e instanceof Error ? e.message : String(e));
  }
}
