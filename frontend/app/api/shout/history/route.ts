import { getHistory } from "../hub";

export async function GET() {
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  const allHistory = getHistory();
  const filtered = allHistory.filter(msg => msg.ts >= threeDaysAgo);
  return Response.json({ items: filtered });
}
