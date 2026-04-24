import { costAuditRequestId, isCostAuditStorageEnabled } from "@/lib/observability/cost-audit";
import { costAuditServerLog } from "@/lib/observability/cost-audit-server";

export async function GET() {
  const reqId = isCostAuditStorageEnabled() ? costAuditRequestId() : "";

  costAuditServerLog({
    route: "/api/shout/stream",
    method: "GET",
    reqId,
    event: "shout.stream.retired_hit",
    ok: true,
  });

  return Response.json(
    {
      ok: false,
      error: "Shoutbox stream retired. Use /api/shout/history polling.",
    },
    { status: 410 },
  );
}
