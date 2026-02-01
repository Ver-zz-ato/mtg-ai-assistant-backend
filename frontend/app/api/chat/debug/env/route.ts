import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2-codex";
  return NextResponse.json({ ok: true, env: { has_OPENAI_API_KEY: hasKey, OPENAI_MODEL: model } });
}
