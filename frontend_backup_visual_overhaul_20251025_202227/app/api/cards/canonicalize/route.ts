export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { canonicalize, getCanonicalStats } from "@/lib/cards/canonicalize";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  const out = canonicalize(name);
  const stats = getCanonicalStats();
  return NextResponse.json({ ok: true, input: name, ...out, stats });
}