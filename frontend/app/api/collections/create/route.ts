import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { containsProfanity, sanitizeName } from "@/lib/profanity";
export const runtime = "nodejs";


export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = (await req.json()) as { name?: string };
    const clean = sanitizeName(name ?? "");
    if (containsProfanity(clean)) {
      return NextResponse.json({ error: "Please choose a different collection name" }, { status: 400 });
    }
    if (!clean) {
      return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: clean })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // ANALYTICS: Track collection creation
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("collection_created", { collection_id: data.id, user_id: user.id, name: clean }); } catch {}

    return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

