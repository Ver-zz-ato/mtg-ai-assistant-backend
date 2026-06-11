export type RssFeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
};

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return stripHtml(stripCdata(m[1]));
}

function linkFromBlock(block: string): string {
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (href?.[1]) return href[1].trim();
  const plain = tagValue(block, "link");
  return plain.trim();
}

export function parseRssXml(xml: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const block of blocks) {
    const title = tagValue(block, "title");
    const link = linkFromBlock(block);
    const description =
      tagValue(block, "description") ||
      tagValue(block, "summary") ||
      tagValue(block, "content");
    const pubDate = tagValue(block, "pubDate") || tagValue(block, "published") || null;
    if (!title && !link) continue;
    items.push({
      title: title || "(untitled)",
      link,
      description,
      pubDate,
    });
  }
  return items;
}

export async function fetchRssFeedItems(feedUrl: string, timeoutMs = 15000): Promise<RssFeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "ManaTapMarketingRadar/1.0 (RSS reader; admin signal analysis)",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRssXml(xml);
  } finally {
    clearTimeout(timer);
  }
}
