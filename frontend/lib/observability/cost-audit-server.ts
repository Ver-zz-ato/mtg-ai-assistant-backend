/**
 * Server-only CostAudit logging + optional DB persistence.
 * Import this only from server code (API routes, RSC, server actions).
 */

import {
  isCostAuditServerEnabled,
  isCostAuditStorageEnabled,
} from "@/lib/observability/cost-audit";
import {
  isCostAuditDbPersistEnabled,
  persistCostAuditEventAsync,
} from "@/lib/observability/cost-audit-persist";

const PREFIX = "[CostAudit]";

export type CostAuditServerFields = {
  route: string;
  method?: string;
  reqId?: string;
  durationMs?: number;
  ok?: boolean;
  err?: string;
  userId?: string | null;
} & Record<string, unknown>;

export function costAuditServerLog(fields: CostAuditServerFields): void {
  if (!isCostAuditStorageEnabled()) return;
  const line = {
    ts: new Date().toISOString(),
    ...fields,
  };
  if (isCostAuditServerEnabled()) {
    console.log(PREFIX, JSON.stringify(line));
  }
  if (isCostAuditDbPersistEnabled()) {
    persistCostAuditEventAsync("server", line);
  }
}

export function costAuditHomepageRender(extra?: Record<string, unknown>): void {
  costAuditServerLog({
    route: "/",
    method: "RSC",
    event: "page.render",
    ...extra,
  });
}

export { isCostAuditDbPersistEnabled };
export {
  isCostAuditServerEnabled,
  isCostAuditStorageEnabled,
  costAuditRequestId,
  costAuditSafeErr,
} from "@/lib/observability/cost-audit";
