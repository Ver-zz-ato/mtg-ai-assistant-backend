import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SaveDeckBody = {
  title: string;
  deck_text: string;
  is_public?: boolean;
};

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SaveDeckBody | null;
    const title = body?.title?.trim();
    const deck_text = body?.deck_text?.trim();
    const is_public = Boolean(body?.is_public);

    if (!title || !deck_text) {
      return NextResponse.json(
        { error: 'Missing "title" or "deck_text"' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title,
        deck_text,
        is_public,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
