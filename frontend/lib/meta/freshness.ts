/**
 * Truthful freshness copy shared by website meta surfaces.
 * Mirrors the app's meta label behavior so web + app stay aligned.
 */

export type MetaLabelStyle = "global" | "manatap";

export type MetaPillMode = "global" | "manatap" | "blended";

export type MetaLabelPayload = {
  style?: MetaLabelStyle;
  pillMode?: MetaPillMode;
  commandersExternalOk?: boolean;
  cardsExternalOk?: boolean;
};

export function formatMetaUpdatedPhrase(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  const dayStart = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const sameCalendarDay = dayStart(d) === dayStart(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday = dayStart(d) === dayStart(y);

  if (sameCalendarDay) {
    if (diffM < 2) return "just now";
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return "today";
  }
  if (isYesterday) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

export function formatMetaFreshnessPill(
  updatedAt: string | null,
  labelRow: MetaLabelPayload | null,
): string | null {
  if (!updatedAt) return null;
  const phrase = formatMetaUpdatedPhrase(updatedAt);

  if (!labelRow) {
    return `Updated ${phrase}`;
  }

  let mode: MetaPillMode = "blended";
  if (labelRow.pillMode) mode = labelRow.pillMode;
  else if (labelRow.style === "manatap") mode = "manatap";
  else if (labelRow.style === "global") mode = "global";

  let prefix = "Blended trends";
  if (mode === "manatap") prefix = "ManaTap trends";
  else if (mode === "global") prefix = "Global trends";

  return `${prefix} · updated ${phrase}`;
}
