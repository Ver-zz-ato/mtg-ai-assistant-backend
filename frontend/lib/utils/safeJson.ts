// lib/utils/safeJson.ts
// Safely parse cookies that might be plain JSON or base64-JSON.
// Use: const raw = cookies().get("myCookie")?.value; const obj = safeParseCookie(raw) || {};
export function safeParseCookie(value: string | undefined | null): any | null {
  if (!value) return null;
  try { return JSON.parse(value); } catch {}
  if (value.startsWith("base64-")) {
    const b64 = value.slice(7);
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {}
  }
  return null;
}
