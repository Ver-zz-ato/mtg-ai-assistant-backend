import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CardRow = { name: string; qty: number };
function parseDeckText(text?: string | null): CardRow[] {
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    const m = t.match(/^(\d+)\s+(.+)$/);
    return m ? { qty: Number(m[1]), name: m[2] } : { qty: 1, name: t };
  }).filter(c => c.name);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.from("decks").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deck: data }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

// Backward-compatible SAVE (some UIs still POST to /api/decks/[id])
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "No
