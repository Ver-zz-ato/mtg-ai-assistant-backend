export function canonicalize(input: string): { canonicalName: string } {
  const key = String(input || "").trim().toLowerCase();
  if (!key) return { canonicalName: "" };
  // Minimal alias map for client-only contexts; server canonicalize is richer.
  const aliases: Record<string, string> = {
    "l. bolt": "lightning bolt",
    "lightning bolt": "lightning bolt",
    "sol ring": "sol ring",
  };
  const mapped = aliases[key] || key;
  return { canonicalName: mapped };
}
