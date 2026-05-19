import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("collections")
      .select("id, name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const collections = (data ?? []) as Array<{ id: string; name: string; created_at: string | null }>;
    let heroNameByCollection = new Map<string, string>();
    if (collections.length > 0) {
      const { data: metaRows } = await supabase
        .from("collection_meta")
        .select("collection_id, data")
        .in("collection_id", collections.map((row) => row.id));
      heroNameByCollection = new Map(
        ((metaRows ?? []) as Array<{ collection_id: string; data?: Record<string, unknown> | null }>)
          .map((row) => {
            const value = typeof row.data?.hero_card_name === "string" ? row.data.hero_card_name.trim() : "";
            return [row.collection_id, value] as const;
          })
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      );
    }

    return NextResponse.json(
      {
        ok: true,
        collections: collections.map((row) => ({
          ...row,
          hero_card_name: heroNameByCollection.get(row.id) ?? null,
        })),
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unexpected error" }, { status: 500 });
  }
}

