import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { getPublicVisibilityCooldown } from "@/lib/server/publicVisibilityCooldown";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: wishlistId } = await params;
    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = request.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!sameOriginOrBearerPresent(request)) {
      return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const is_public = body?.is_public !== false; // default true

    // Verify ownership
    const { data: wishlist, error: fetchError } = await supabase
      .from("wishlists")
      .select("id, user_id, name, is_public, public_toggled_at")
      .eq("id", wishlistId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !wishlist) {
      return NextResponse.json(
        { ok: false, error: "Wishlist not found or unauthorized" },
        { status: 403 }
      );
    }

    const existingPublic = (wishlist as { is_public?: boolean }).is_public === true;
    const publicToggleRequested = is_public !== existingPublic;
    const publishCooldownApplies = publicToggleRequested && is_public === true;
    if (publishCooldownApplies) {
      const cooldown = getPublicVisibilityCooldown((wishlist as { public_toggled_at?: string | null }).public_toggled_at);
      if (!cooldown.ok) {
        return NextResponse.json(
          { ok: false, error: cooldown.message, retryAfterSeconds: cooldown.retryAfterSeconds },
          { status: 429 },
        );
      }
    }

    // Update is_public status
    const patch: Record<string, unknown> = { is_public };
    if (publishCooldownApplies) {
      patch.public_toggled_at = new Date().toISOString();
    }
    const { error: updateError } = await supabase
      .from("wishlists")
      .update(patch)
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
