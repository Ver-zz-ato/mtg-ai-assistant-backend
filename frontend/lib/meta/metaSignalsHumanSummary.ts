import type { MetaSignalsJobDetail } from "./metaSignalsJobStatus";

export function buildMetaSignalsHumanLine(d: MetaSignalsJobDetail): string {
  const rr = d.runResult ?? (d.ok ? "success" : "failed");
  const mode = d.pillMode;
  const dh = d.dailyHistory;
  const cmd = dh?.commanderRowsUpserted ?? 0;
  const card = dh?.cardRowsUpserted ?? 0;
  const y = d.yesterdayRanksAvailable ? "yday ranks ✓" : "yday ranks ✗";
  const sec =
    d.changedSectionsCount != null ? `${d.changedSectionsCount} sect chg` : "";
  const ups = d.metaSignalsUpserts != null ? `${d.metaSignalsUpserts} writes` : "";
  const dur =
    d.durationMs != null && d.durationMs >= 0
      ? `${(d.durationMs / 1000).toFixed(1)}s`
      : "";
  const parts = [rr.toUpperCase(), dur, `mode ${mode}`, sec, ups, `daily ${cmd}/${card}`, y].filter(Boolean);
  return parts.join(" · ");
}

export function buildMetaSignalsHumanDetail(d: MetaSignalsJobDetail): string {
  const lines: string[] = [];
  lines.push(buildMetaSignalsHumanLine(d));
  if (d.sourcesLine) lines.push(`Sources: ${d.sourcesLine}`);
  if (d.sectionCounts && Object.keys(d.sectionCounts).length > 0) {
    lines.push(
      "Sections: " +
        Object.entries(d.sectionCounts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
    );
  }
  if (d.priorSnapshotUsedFor?.length) {
    lines.push(`Prior snapshot used for: ${d.priorSnapshotUsedFor.join(", ")}`);
  }
  if (d.trendingDiff?.additions?.length) {
    lines.push(`Added (trending): ${d.trendingDiff.additions.join(", ")}`);
  }
  if (d.trendingDiff?.removals?.length) {
    lines.push(`Removed (trending): ${d.trendingDiff.removals.join(", ")}`);
  }
  if (d.trendingDiff?.movers?.length) {
    lines.push(
      `Movers: ${d.trendingDiff.movers.map((m) => `${m.name} ${m.label}`).join("; ")}`
    );
  }
  if (d.warnings?.length) lines.push("Warnings:\n- " + d.warnings.join("\n- "));
  return lines.join("\n");
}
