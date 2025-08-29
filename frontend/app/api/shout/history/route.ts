import { getHistory } from "../hub";

export async function GET() {
  return Response.json({ items: getHistory() });
}
