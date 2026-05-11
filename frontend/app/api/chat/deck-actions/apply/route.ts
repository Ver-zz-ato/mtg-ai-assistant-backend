import { NextResponse } from "next/server";
import { getDeckActionAuth } from "@/lib/chat/deck-action-auth";
import { applyDeckChangeProposal } from "@/lib/chat/deck-actions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = String(body.proposalId || body.proposal_id || "").trim();
    if (!proposalId) return NextResponse.json({ ok: false, error: "proposalId is required" }, { status: 400 });
    const { supabase, userId } = await getDeckActionAuth(req);
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const result = await applyDeckChangeProposal({ supabase, userId, proposalId });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
