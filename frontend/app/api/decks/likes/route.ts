import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LikeSummary = { count: number; liked: boolean };

function parseDeckIds(req: NextRequest): string[] {
  const url = new URL(req.url);
  const repeated = url.searchParams.getAll("id");
  const csv = url.searchParams.get("ids");
  const raw = [...repeated, ...(csv ? csv.split(",") : [])];
  return Array.from(
    new Set(
      raw
        .map((id) => id.trim())
        .filter((id) => /^[0-9a-fA-F-]{20,64}$/.test(id)),
    ),
  ).slice(0, 100);
}

export async function GET(req: NextRequest) {
  const deckIds = parseDeckIds(req);
  if (deckIds.length === 0) {
    return NextResponse.json({ ok: true, authenticated: false, likes: {} });
  }

  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user ?? null;

  const likes: Record<string, LikeSummary> = {};
  for (const id of deckIds) likes[id] = { count: 0, liked: false };

  const { data: rows } = await supabase
    .from("deck_likes")
    .select("deck_id,user_id")
    .in("deck_id", deckIds);

  for (const row of Array.isArray(rows) ? rows : []) {
    const deckId = String((row as any).deck_id ?? "");
    if (!likes[deckId]) continue;
    likes[deckId].count += 1;
    if (user?.id && (row as any).user_id === user.id) likes[deckId].liked = true;
  }

  return NextResponse.json({ ok: true, authenticated: !!user, likes });
}
