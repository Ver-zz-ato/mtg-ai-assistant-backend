import { NextRequest, NextResponse } from "next/server";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { getServiceRoleClient } from "@/lib/server-supabase";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";
import { getBinderCollectionIdBySlug } from "@/lib/server/binder-resolve";

export const runtime = "nodejs";

type Params = { slug: string };

function normalizeSlug(raw: string) {
  return decodeURIComponent(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectionIdFromGeneratedSlug(slug: string): string | null {
  const match = slug.match(/^collection-([a-f0-9]{32})$/i);
  if (!match) return null;
  const compact = match[1];
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  const burst = checkRateLimit(req, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 120,
    keyGenerator: (request) => `public-collection:${extractIP(request)}`,
  });
  if (!burst.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
      burst,
    );
  }

  const { slug: rawSlug } = await ctx.params;
  const slug = normalizeSlug(rawSlug);
  if (!slug || slug.length < 3 || slug.length > 80) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 }), burst);
  }

  const service = getServiceRoleClient();
  if (!service) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 500 }), burst);
  }

  const collectionId = (await getBinderCollectionIdBySlug(slug)) ?? collectionIdFromGeneratedSlug(slug);
  if (!collectionId) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }), burst);
  }

  const { data: meta } = await service
    .from("collection_meta")
    .select("collection_id,is_public,public_slug,visibility")
    .eq("collection_id", collectionId)
    .maybeSingle();

  const isPublic = meta?.is_public === true || meta?.visibility === "public";
  if (!isPublic) {
    return addRateLimitHeaders(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }), burst);
  }

  const [{ data: collection }, items] = await Promise.all([
    service.from("collections").select("id,name").eq("id", collectionId).maybeSingle(),
    fetchAllSupabaseRows<{ id: string; name: string; qty: number }>(() =>
      service
        .from("collection_cards")
        .select("id,name,qty")
        .eq("collection_id", collectionId)
        .order("name", { ascending: true }),
    ),
  ]);

  return addRateLimitHeaders(
    NextResponse.json({
      ok: true,
      collection: {
        id: collectionId,
        name: collection?.name || "Collection",
        publicSlug: meta?.public_slug || slug,
      },
      items,
    }),
    burst,
  );
}
