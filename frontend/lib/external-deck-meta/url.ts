import type { ParsedExternalDeckUrl } from "./types";

function cleanUrl(raw: string): URL | null {
  try {
    const url = new URL(String(raw || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function parseExternalDeckUrl(raw: string): ParsedExternalDeckUrl | null {
  const url = cleanUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "archidekt.com" && parts[0] === "decks" && parts[1]) {
    const externalId = parts[1].trim();
    if (/^\d+$/.test(externalId)) {
      return {
        sourceKey: "archidekt",
        externalId,
        canonicalUrl: `https://archidekt.com/decks/${externalId}`,
      };
    }
  }

  if (host === "moxfield.com" && parts[0] === "decks" && parts[1]) {
    const externalId = parts[1].trim();
    if (/^[A-Za-z0-9_-]{6,80}$/.test(externalId)) {
      return {
        sourceKey: "moxfield",
        externalId,
        canonicalUrl: `https://moxfield.com/decks/${externalId}`,
      };
    }
  }

  return null;
}

export function sourceDeckUrl(sourceKey: string, externalId: string): string {
  if (sourceKey === "archidekt") return `https://archidekt.com/decks/${externalId}`;
  if (sourceKey === "moxfield") return `https://moxfield.com/decks/${externalId}`;
  return "";
}
