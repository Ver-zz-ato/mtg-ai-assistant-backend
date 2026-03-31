/**
 * Server-side PostHog HogQL (Query API). Used for admin reporting when
 * POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set (same as
 * scripts/audit-phase2/posthog-events.ts).
 */

export type HogqlResult = { columns: string[]; results: unknown[][] };

export function getPosthogQueryCredentials(): { host: string; key: string; projectId: string } | null {
  const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!key || !projectId) return null;
  const host = (
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://eu.posthog.com"
  ).replace(/\/$/, "");
  return { host, key, projectId };
}

export async function posthogHogql(query: string): Promise<HogqlResult> {
  const c = getPosthogQueryCredentials();
  if (!c) throw new Error("posthog_query_not_configured");

  const url = `${c.host}/api/projects/${c.projectId}/query`;
  // External PostHog Query API — not same-origin app fetchJson.
  // eslint-disable-next-line no-restricted-globals -- PostHog server API
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.key}`,
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
    throw new Error(`PostHog API ${res.status}: ${t.slice(0, 600)}`);
  }

  const j = (await res.json()) as { columns?: string[]; results?: unknown[][]; error?: string };
  if (j.error) throw new Error(j.error);
  return { columns: j.columns || [], results: j.results || [] };
}
