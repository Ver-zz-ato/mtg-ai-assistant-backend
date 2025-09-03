// frontend/app/api/collections/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collection_id = searchParams.get("collection_id");
    if (!collection_id) {
      return NextResponse.json({ error: "Missing collection_id" }, { status: 400 });
    }

    // Build a Supabase server client inline (no helper import)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );

    // Auth (RLS still protects, this gives clear 401s)
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Join to ensure the collection belongs to the user
    const { data, error } = await supabase
      .from("collection_cards")
      .select("name, qty, collection_id, collections!inner(user_id)")
      .eq("collection_id", collection_id)
      .eq("collections.user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const owned: Record<string, number> = {};
    for (const row of data || []) {
      owned[(row.name as string).toLowerCase()] = Number(row.qty) || 0;
    }

    return NextResponse.json({ ok: true, owned });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load collection" }, { status: 500 });
  }
}
