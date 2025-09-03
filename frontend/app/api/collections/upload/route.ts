import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "collections/upload" }, { status: 200 });
}

// 🔧 Minimal POST to prove the method is wired
export async function POST() {
  return NextResponse.json({ ok: true, reached: "POST /api/collections/upload" }, { status: 200 });
}
