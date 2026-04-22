import { addClient, removeClient } from "../hub";
import { costAuditRequestId, isCostAuditStorageEnabled } from "@/lib/observability/cost-audit";
import { costAuditServerLog } from "@/lib/observability/cost-audit-server";

export async function GET(req: Request) {
  const tOpen = Date.now();
  const reqId = isCostAuditStorageEnabled() ? costAuditRequestId() : "";
  let pingSent = 0;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  addClient(writer);

  const enc = new TextEncoder();
  const write = (s: string) => writer.write(enc.encode(s));

  costAuditServerLog({
    route: "/api/shout/stream",
    method: "GET",
    reqId,
    event: "shout.stream.open",
    ok: true,
  });

  // keep connection alive
  const ping = setInterval(() => {
    pingSent += 1;
    write(`: ping\n\n`).catch(() => {});
  }, 30000);

  req.signal.addEventListener("abort", () => {
    clearInterval(ping);
    costAuditServerLog({
      route: "/api/shout/stream",
      method: "GET",
      reqId,
      event: "shout.stream.close",
      durationMs: Date.now() - tOpen,
      pingSent,
      reason: "abort",
      ok: true,
    });
    removeClient(writer);
    writer.close().catch(() => {});
  });

  // greet
  write(`event: hello\ndata: "ok"\n\n`);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
