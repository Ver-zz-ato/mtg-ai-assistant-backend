import { NextRequest, NextResponse } from "next/server";

export { POST } from "@/app/api/deck/analyze/route";

/** Hub bookmark — deck checker UI. POST /analyze remains the legacy analyze API re-export. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/mtg-deck-checker", request.url), 307);
}
