import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { notifyOwnerNewComment } from "@/lib/notify-comment-owner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const profanityList = ["fuck", "shit", "ass", "bitch", "damn", "hell", "cock", "dick", "pussy", "fag", "nigger", "cunt"];
function isProfane(text: string): boolean {
  const lower = text.toLowerCase();
  return profanityList.some((word) => lower.includes(word));
}

type ResourceType = "collection" | "roast" | "health_report" | "custom_card";

async function resolveOwnerAndVisibility(
  admin: SupabaseClient<any>,
  type: ResourceType,
  resourceId: string
): Promise<{ ownerId: string | null; label: string; visible: boolean }> {
  if (type === "collection") {
    const { data: colRaw } = await admin
      .from("collections")
      .select("user_id")
      .eq("id", resourceId)
      .maybeSingle();
    const col = colRaw as { user_id: string | null } | null;
    if (!col?.user_id) return { ownerId: null, label: "Collection", visible: false };
    const { data: meta } = await admin
      .from("collection_meta")
      .select("is_public")
      .eq("collection_id", resourceId)
      .maybeSingle();
    const visible = !!(meta as { is_public?: boolean } | null)?.is_public;
    return { ownerId: col.user_id as string, label: "Collection", visible };
  }
  if (type === "roast") {
    const { data: rRaw } = await admin.from("roast_permalinks").select("user_id").eq("id", resourceId).maybeSingle();
    const r = rRaw as { user_id: string | null } | null;
    if (!r?.user_id) return { ownerId: null, label: "Roast", visible: false };
    return { ownerId: r.user_id as string, label: "Deck roast", visible: true };
  }
  if (type === "health_report") {
    const { data: hRaw } = await admin.from("shared_health_reports").select("user_id").eq("id", resourceId).maybeSingle();
    const h = hRaw as { user_id: string | null } | null;
    if (!h?.user_id) return { ownerId: null, label: "Health report", visible: false };
    return { ownerId: h.user_id as string, label: "Deck health", visible: true };
  }
  if (type === "custom_card") {
    const { data: cRaw } = await admin
      .from("custom_cards")
      .select("user_id, public_slug")
      .eq("id", resourceId)
      .maybeSingle();
    const c = cRaw as { user_id: string | null; public_slug?: string | null } | null;
    if (!c?.user_id) return { ownerId: null, label: "Custom card", visible: false };
    const visible = !!c.public_slug;
    return { ownerId: c.user_id as string, label: "Custom card", visible };
  }
  return { ownerId: null, label: "Item", visible: false };
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

/**
 * GET /api/share/comments?resource_type=&resource_id=
 */
export async function GET(req: NextRequest) {
  try {
    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }
    const url = req.nextUrl;
    const type = url.searchParams.get("resource_type") as ResourceType | null;
    const resourceId = url.searchParams.get("resource_id")?.trim() ?? "";
    if (!type || !resourceId || !["collection", "roast", "health_report", "custom_card"].includes(type)) {
      return NextResponse.json({ ok: false, error: "Bad resource" }, { status: 400 });
    }
    const { visible } = await resolveOwnerAndVisibility(admin, type, resourceId);
    if (!visible) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { data: comments, error } = await admin
      .from("shared_item_comments")
      .select("id, content, created_at, user_id")
      .eq("resource_type", type)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("share_comments_get", error);
      return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
    }

    const enriched = await Promise.all(
      (comments || []).map(async (comment) => {
        const { data: userData } = await admin.auth.admin.getUserById(comment.user_id);
        const meta = userData?.user?.user_metadata || {};
        return {
          ...comment,
          author: {
            id: comment.user_id,
            username: (meta as { username?: string }).username || "Player",
            avatar: (meta as { avatar?: string }).avatar || null,
          },
        };
      })
    );

    return NextResponse.json({ ok: true, comments: enriched });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/share/comments
 * Body: { resource_type, resource_id, content }
 */
export async function POST(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Must be logged in" }, { status: 401 });
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.resource_type as ResourceType | undefined;
    const resourceId = typeof body?.resource_id === "string" ? body.resource_id.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!type || !resourceId || !["collection", "roast", "health_report", "custom_card"].includes(type)) {
      return NextResponse.json({ ok: false, error: "Bad resource" }, { status: 400 });
    }
    if (!content || content.length > 5000) {
      return NextResponse.json({ ok: false, error: "Invalid content" }, { status: 400 });
    }
    if (isProfane(content)) {
      return NextResponse.json({ ok: false, error: "Inappropriate language" }, { status: 400 });
    }

    const { ownerId, label, visible } = await resolveOwnerAndVisibility(admin, type, resourceId);
    if (!visible || !ownerId) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("shared_item_comments")
      .insert({
        resource_type: type,
        resource_id: resourceId,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (insErr || !inserted) {
      console.error("share_comments_insert", insErr);
      return NextResponse.json({ ok: false, error: "Failed to post" }, { status: 500 });
    }

    const meta = user.user_metadata || {};
    void notifyOwnerNewComment({
      ownerUserId: ownerId,
      actorUserId: user.id,
      resourceLabel: label,
      preview: content,
      data: { resource_type: type, resource_id: resourceId },
    });

    return NextResponse.json({
      ok: true,
      comment: {
        ...inserted,
        author: {
          id: user.id,
          username: (meta as { username?: string }).username || "Player",
          avatar: (meta as { avatar?: string }).avatar || null,
        },
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
