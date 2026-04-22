/**
 * Pass 1 cost / Fluid diagnostics. Gated by env — no overhead when disabled.
 *
 * Server console: VERCEL_COST_AUDIT=1
 * Server DB rows: VERCEL_COST_AUDIT_DB=1 (see cost-audit-server.ts)
 * Client (browser logs): NEXT_PUBLIC_VERCEL_COST_AUDIT=1
 * Client DB ingest: NEXT_PUBLIC_VERCEL_COST_AUDIT_DB=1 (admin session only; see /api/admin/cost-audit/ingest)
 */

const PREFIX = "[CostAudit]";

export function isCostAuditServerEnabled(): boolean {
  return process.env.VERCEL_COST_AUDIT === "1";
}

/** True when any server-side audit sink is on (console or DB). */
export function isCostAuditStorageEnabled(): boolean {
  return process.env.VERCEL_COST_AUDIT === "1" || process.env.VERCEL_COST_AUDIT_DB === "1";
}

export function isCostAuditClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VERCEL_COST_AUDIT === "1";
}

/** Works in Node and browser (no `import "crypto"` — safe for client bundles). */
export function costAuditRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().slice(0, 10);
    }
  } catch {
    /* ignore */
  }
  return `r${Math.random().toString(36).slice(2, 12)}`;
}

export function costAuditClientLog(fields: Record<string, unknown>): void {
  if (!isCostAuditClientEnabled()) return;
  const pathname =
    typeof window !== "undefined"
      ? String(window.location.pathname || "").slice(0, 500)
      : undefined;
  const line = {
    ts: new Date().toISOString(),
    ...fields,
    ...(fields.pathname == null && pathname ? { pathname } : {}),
  };
  console.log(PREFIX, JSON.stringify(line));
  if (
    process.env.NEXT_PUBLIC_VERCEL_COST_AUDIT === "1" &&
    process.env.NEXT_PUBLIC_VERCEL_COST_AUDIT_DB === "1"
  ) {
    void fetch("/api/admin/cost-audit/ingest", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [line] }),
    }).catch(() => {});
  }
}

export function costAuditSafeErr(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}
