import { NextRequest, NextResponse } from "next/server";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { getServiceRoleClient } from "@/lib/server-supabase";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";

export const runtime = "nodejs";

type Params = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  const burst = checkRateLimit(req, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 120,
    keyGenerator: (request) => `public-wishlist:${extractIP(request)}`,
  });
  if (!burst.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
      burst,
    );
  }

  const { id } = await ctx.params;
  if (!UUID_RE.test(id || "")) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 }), burst);
  }

  const service = getServiceRoleClient();
  if (!service) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 500 }), burst);
  }

  const { data: wishlist } = await service
    .from("wishlists")
    .select("id,name,is_public")
    .eq("id", id)
    .maybeSingle();

  if (!wishlist || wishlist.is_public !== true) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }), burst);
  }

  const items = await fetchAllSupabaseRows<{ id: string; name: string; qty: number }>(() =>
    service
      .from("wishlist_items")
      .select("id,name,qty")
      .eq("wishlist_id", id)
      .order("name", { ascending: true }),
  );

  return addRateLimitHeaders(
    NextResponse.json({
      ok: true,
      wishlist: {
        id,
        name: wishlist.name || "Wishlist",
      },
      items,
    }),
    burst,
  );
}
