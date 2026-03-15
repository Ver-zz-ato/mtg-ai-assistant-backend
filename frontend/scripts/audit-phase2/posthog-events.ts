#!/usr/bin/env tsx
/**
 * Phase 2 audit: PostHog event counts and suggestion dataset.
 *
 * Usage:
 *   POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 npx tsx scripts/audit-phase2/posthog-events.ts
 *
 * Get personal API key: PostHog → Project Settings → Personal API Keys (with Query read).
 * Project ID: Project Settings → Project ID.
 *
 * Outputs JSON to stdout for use in Phase 2 report.
 */

import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const PH_HOST = process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com";
const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PH_PROJECT = process.env.POSTHOG_PROJECT_ID;

async function hogql(query: string): Promise<{ columns: string[]; results: unknown[][] }> {
  const url = `${PH_HOST.replace(/\/$/, "")}/api/projects/${PH_PROJECT}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PH_KEY}`,
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PostHog API ${res.status}: ${t}`);
  }
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return { columns: j.columns || [], results: j.results || [] };
}

async function main() {
  if (!PH_KEY || !PH_PROJECT) {
    console.error(
      "Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (e.g. in .env.local). Get key from PostHog → Project Settings → Personal API Keys."
    );
    process.exit(1);
  }

  type Step1Totals = Record<string, number | null>;
  type Step1ByMonth = Record<string, Record<string, number> | null>;
  const out: {
    meta: unknown;
    step1_event_totals: Step1Totals;
    step1_by_month: Step1ByMonth;
    step1_by_deck: Record<string, number> | null;
    step1_by_commander: Record<string, number> | null;
    step2_unique_suggestion_ids: number | null;
    step2_accepted_count: number | null;
    step2_top_50_accepted_cards: { card: string; count: number }[];
  } = {
    meta: { ph_host: PH_HOST, project_id: PH_PROJECT, ran_at: new Date().toISOString() },
    step1_event_totals: {} as Step1Totals,
    step1_by_month: {} as Step1ByMonth,
    step1_by_deck: null as Record<string, number> | null,
    step1_by_commander: null as Record<string, number> | null,
    step2_unique_suggestion_ids: null as number | null,
    step2_accepted_count: null as number | null,
    step2_top_50_accepted_cards: [] as { card: string; count: number }[],
  };

  const events = [
    "ai_suggestion_shown",
    "ai_suggestion_accepted",
    "deck_analyzed",
    "deck_saved",
    "mulligan_decision",
  ];

  for (const ev of events) {
    try {
      const { results } = await hogql(
        `SELECT count() as c FROM events WHERE event = '${ev.replace(/'/g, "''")}'`
      );
      out.step1_event_totals[ev] = Number(results[0]?.[0] ?? 0);
    } catch (e) {
      out.step1_event_totals[ev] = null;
      console.error(`Event ${ev}:`, (e as Error).message);
    }
  }

  for (const ev of events) {
    try {
      const { results } = await hogql(`
        SELECT toStartOfMonth(timestamp) as month, count() as c
        FROM events WHERE event = '${ev.replace(/'/g, "''")}'
        GROUP BY month ORDER BY month DESC LIMIT 24
      `);
      out.step1_by_month[ev] = Object.fromEntries(
        (results as [string, number][]).map(([m, c]) => [String(m).slice(0, 7), c])
      );
    } catch (e) {
      out.step1_by_month[ev] = null;
    }
  }

  try {
    const { results } = await hogql(`
      SELECT properties.deck_id as deck_id, count() as c
      FROM events WHERE event IN ('ai_suggestion_shown','ai_suggestion_accepted','deck_analyzed','deck_saved')
        AND properties.deck_id IS NOT NULL AND properties.deck_id != ''
      GROUP BY deck_id ORDER BY c DESC LIMIT 500
    `);
    out.step1_by_deck = Object.fromEntries((results as [string, number][]).map(([d, c]) => [String(d), c]));
  } catch (e) {
    out.step1_by_deck = null;
    console.error("By deck:", (e as Error).message);
  }

  try {
    const { results } = await hogql(`
      SELECT properties.commander_name as cmd, count() as c
      FROM events WHERE event IN ('ai_suggestion_shown','ai_suggestion_accepted','deck_analyzed','deck_saved')
        AND properties.commander_name IS NOT NULL AND properties.commander_name != ''
      GROUP BY cmd ORDER BY c DESC LIMIT 200
    `);
    out.step1_by_commander = Object.fromEntries((results as [string, number][]).map(([c, n]) => [String(c), n]));
  } catch (e) {
    out.step1_by_commander = null;
    console.error("By commander:", (e as Error).message);
  }

  try {
    const { results } = await hogql(`
      SELECT uniq(properties.suggestion_id) as u FROM events WHERE event = 'ai_suggestion_shown' AND properties.suggestion_id IS NOT NULL
    `);
    out.step2_unique_suggestion_ids = Number(results[0]?.[0] ?? 0);
  } catch (e) {
    out.step2_unique_suggestion_ids = null;
  }

  try {
    const { results } = await hogql(
      `SELECT count() as c FROM events WHERE event = 'ai_suggestion_accepted'`
    );
    out.step2_accepted_count = Number(results[0]?.[0] ?? 0);
  } catch (e) {
    out.step2_accepted_count = null;
  }

  try {
    const { results } = await hogql(`
      SELECT properties.card as card, count() as c
      FROM events WHERE event = 'ai_suggestion_accepted' AND properties.card IS NOT NULL
      GROUP BY card ORDER BY c DESC LIMIT 50
    `);
    out.step2_top_50_accepted_cards = (results as [string, number][]).map(([card, count]) => ({ card: String(card), count }));
  } catch (e) {
    out.step2_top_50_accepted_cards = [];
    console.error("Top accepted:", (e as Error).message);
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
