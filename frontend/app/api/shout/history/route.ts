import { getHistory, type Shout } from "../hub";
import { createClient } from "@/lib/supabase/server";
import {
  costAuditRequestId,
  isCostAuditStorageEnabled,
} from "@/lib/observability/cost-audit";
import { costAuditServerLog } from "@/lib/observability/cost-audit-server";

const RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET() {
  const t0 = Date.now();
  const reqId = isCostAuditStorageEnabled() ? costAuditRequestId() : "";

  const cutoffTime = Date.now() - RETENTION_MS;
  const cutoffISO = new Date(cutoffTime).toISOString();

  const supabase = await createClient();

  // Get messages from database (only within retention window).
  // Retention deletes are handled by /api/shout/cleanup (cron), not on this path.
  let dbMessages: Shout[] = [];
  try {
    const { data, error } = await supabase
      .from("shoutbox_messages")
      .select("id, user_name, message_text, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      dbMessages = data.map((row) => ({
        id: Number(row.id),
        user: row.user_name,
        text: row.message_text,
        ts: new Date(row.created_at).getTime(),
      }));
    }
  } catch (err) {
    console.error("Failed to load shoutbox messages from database:", err);
  }

  // Get in-memory messages (runtime-only posts not yet reflected in DB)
  const memoryHistory = getHistory();

  // Combine and deduplicate (prefer database messages for persisted rows)
  const messageMap = new Map<number, Shout>();

  // Add runtime-only in-memory messages (negative IDs) within retention window
  memoryHistory
    .filter((msg) => msg.id < 0 && msg.ts >= cutoffTime)
    .forEach((msg) => {
      messageMap.set(msg.id, msg);
    });

  // Add database messages (positive IDs)
  dbMessages.forEach((msg) => {
    messageMap.set(msg.id, msg);
  });

  // Convert back to array, filter by time, and sort (oldest first, newest at bottom)
  const allMessages = Array.from(messageMap.values())
    .filter((msg) => msg.ts >= cutoffTime)
    .sort((a, b) => a.ts - b.ts)
    .slice(-100);

  costAuditServerLog({
    route: "/api/shout/history",
    method: "GET",
    reqId,
    event: "shout.history",
    durationMs: Date.now() - t0,
    messageCount: allMessages.length,
    cleanupRan: false,
    cleanupDeleted: null,
    ok: true,
  });

  return Response.json({ items: allMessages });
}
