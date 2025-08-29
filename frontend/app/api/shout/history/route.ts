import { getHistory } from "../stream/route";

export async function GET() {
  return Response.json({ items: getHistory() });
}
