import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sameOriginOk } from "@/lib/api/csrf";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: wishlistId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!sameOriginOk(request)) {
      return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const is_public = body?.is_public !== false; // default true

    // Verify ownership
    const { data: wishlist, error: fetchError } = await supabase
      .from("wishlists")
      .select("id, user_id, name")
      .eq("id", wishlistId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !wishlist) {
      return NextResponse.json(
        { ok: false, error: "Wishlist not found or unauthorized" },
        { status: 403 }
      );
    }

    // Update is_public status
    const { error: updateError } = await supabase
      .from("wishlists")
      .update({ is_public: is_public })
      .eq("id", wishlistId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    // Generate shareable URL (similar to decks/collections pattern)
    let base: string;
    if (process.env.NODE_ENV === "production") {
      base = process.env.NEXT_PUBLIC_BASE_URL || "https://manatap.ai";
    } else {
      base = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl?.origin || "http://localhost:3000";
    }

    // For now, use wishlist ID in URL (could use slug later)
    const url = `${base}/wishlist/${encodeURIComponent(wishlistId)}`;
    
    return NextResponse.json({ ok: true, url, is_public });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}
