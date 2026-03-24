import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

function adminClient(): SupabaseClient<any> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

function labelFromProfile(p: { username?: string | null; display_name?: string | null }): string {
  const u = p.username?.trim();
  if (u) return u;
  const d = p.display_name?.trim();
  if (d) return d;
  return "Someone";
}

async function buildAuthorMap(
  admin: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await admin.from("profiles_public").select("id, username, display_name").in("id", uniq);
  for (const p of data ?? []) {
    const row = p as { id: string; username?: string | null; display_name?: string | null };
    map.set(row.id, labelFromProfile(row));
  }
  for (const id of uniq) {
    if (!map.has(id)) map.set(id, "Someone");
  }
  return map;
}

/**
 * GET /api/users/me/inbox-comments
 * Bearer: mobile. Aggregates all comments on the user's public decks + shared items (collections, roasts, health, custom cards)
 * in one response — avoids dozens of per-resource HTTP calls from the app.
 */
export async function GET(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const { user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }

    const userId = user.id;
    const merged: Array<{
      id: string;
      commentId: string;
      kind: "deck" | "collection" | "roast" | "health_report" | "custom_card";
      resourceId: string;
      title: string;
      content: string;
      created_at: string;
      authorLabel: string;
      collectionSlug?: string;
      customCardSlug?: string;
    }> = [];

    const [
      { data: publicDecks },
      { data: userCols },
      { data: roastRows },
      { data: healthRows },
      { data: cardRows },
    ] = await Promise.all([
      admin.from("decks").select("id, title").eq("user_id", userId).eq("is_public", true),
      admin.from("collections").select("id, name").eq("user_id", userId),
      admin.from("roast_permalinks").select("id, commander").eq("user_id", userId),
      admin.from("shared_health_reports").select("id, snapshot_json").eq("user_id", userId),
      admin.from("custom_cards").select("id, title, public_slug").eq("user_id", userId).not("public_slug", "is", null),
    ]);

    const deckList = (publicDecks ?? []) as { id: string; title: string | null }[];
    const deckTitleById = new Map(deckList.map((d) => [d.id, d.title?.trim() || "Deck"]));

    if (deckList.length > 0) {
      const deckIds = deckList.map((d) => d.id);
      const { data: deckComments } = await admin
        .from("deck_comments")
        .select("id, deck_id, content, created_at, user_id")
        .in("deck_id", deckIds)
        .order("created_at", { ascending: false });
      const dc = (deckComments ?? []) as Array<{
        id: string;
        deck_id: string;
        content: string;
        created_at: string;
        user_id: string;
      }>;
      const authorIds = dc.map((c) => c.user_id);
      const authors = await buildAuthorMap(admin, authorIds);
      for (const c of dc) {
        merged.push({
          id: `deck-${c.deck_id}-${c.id}`,
          commentId: String(c.id),
          kind: "deck",
          resourceId: c.deck_id,
          title: deckTitleById.get(c.deck_id) ?? "Deck",
          content: c.content,
          created_at: c.created_at,
          authorLabel: authors.get(c.user_id) ?? "Someone",
        });
      }
    }

    const colList = (userCols ?? []) as { id: string; name: string | null }[];
    if (colList.length > 0) {
      const colIds = colList.map((c) => c.id);
      const { data: metaRows } = await admin
        .from("collection_meta")
        .select("collection_id, public_slug")
        .eq("is_public", true)
        .in("collection_id", colIds);
      const slugByCol = new Map(
        (metaRows ?? []).map((m: { collection_id: string; public_slug: string | null }) => [
          String(m.collection_id),
          m.public_slug,
        ])
      );
      const nameByCol = new Map(colList.map((c) => [String(c.id), c.name?.trim() || "Collection"]));
      const publicColIds = colIds.filter((id) => Boolean(slugByCol.get(String(id))));
      if (publicColIds.length > 0) {
        const ridStrings = publicColIds.map((id) => String(id));
        const { data: sic } = await admin
          .from("shared_item_comments")
          .select("id, resource_id, content, created_at, user_id")
          .eq("resource_type", "collection")
          .in("resource_id", ridStrings)
          .order("created_at", { ascending: false });
        const rows = (sic ?? []) as Array<{
          id: string;
          resource_id: string;
          content: string;
          created_at: string;
          user_id: string;
        }>;
        const authors = await buildAuthorMap(
          admin,
          rows.map((r) => r.user_id)
        );
        for (const cm of rows) {
          const rid = String(cm.resource_id);
          const slug = slugByCol.get(rid);
          if (!slug) continue;
          merged.push({
            id: `collection-${rid}-${cm.id}`,
            commentId: String(cm.id),
            kind: "collection",
            resourceId: rid,
            title: nameByCol.get(rid) ?? "Collection",
            content: cm.content,
            created_at: cm.created_at,
            authorLabel: authors.get(cm.user_id) ?? "Someone",
            collectionSlug: String(slug),
          });
        }
      }
    }

    const roasts = (roastRows ?? []) as { id: string; commander?: string | null }[];
    if (roasts.length > 0) {
      const roastIds = roasts.map((r) => String(r.id));
      const titleByRoast = new Map(
        roasts.map((r) => [
          String(r.id),
          r.commander?.trim() ? `Roast: ${r.commander}` : "Deck roast",
        ])
      );
      const { data: sic } = await admin
        .from("shared_item_comments")
        .select("id, resource_id, content, created_at, user_id")
        .eq("resource_type", "roast")
        .in("resource_id", roastIds)
        .order("created_at", { ascending: false });
      const rows = (sic ?? []) as Array<{
        id: string;
        resource_id: string;
        content: string;
        created_at: string;
        user_id: string;
      }>;
      const authors = await buildAuthorMap(
        admin,
        rows.map((r) => r.user_id)
      );
      for (const cm of rows) {
        const rid = String(cm.resource_id);
        merged.push({
          id: `roast-${rid}-${cm.id}`,
          commentId: String(cm.id),
          kind: "roast",
          resourceId: rid,
          title: titleByRoast.get(rid) ?? "Deck roast",
          content: cm.content,
          created_at: cm.created_at,
          authorLabel: authors.get(cm.user_id) ?? "Someone",
        });
      }
    }

    const healthList = (healthRows ?? []) as { id: string; snapshot_json?: { title?: string } | null }[];
    if (healthList.length > 0) {
      const healthIds = healthList.map((h) => String(h.id));
      const titleByHealth = new Map(
        healthList.map((h) => {
          const snap = h.snapshot_json;
          const t =
            typeof snap === "object" && snap && "title" in snap && typeof snap.title === "string" && snap.title.trim()
              ? snap.title.trim()
              : "Health snapshot";
          return [String(h.id), t];
        })
      );
      const { data: sic } = await admin
        .from("shared_item_comments")
        .select("id, resource_id, content, created_at, user_id")
        .eq("resource_type", "health_report")
        .in("resource_id", healthIds)
        .order("created_at", { ascending: false });
      const rows = (sic ?? []) as Array<{
        id: string;
        resource_id: string;
        content: string;
        created_at: string;
        user_id: string;
      }>;
      const authors = await buildAuthorMap(
        admin,
        rows.map((r) => r.user_id)
      );
      for (const cm of rows) {
        const rid = String(cm.resource_id);
        merged.push({
          id: `health-${rid}-${cm.id}`,
          commentId: String(cm.id),
          kind: "health_report",
          resourceId: rid,
          title: titleByHealth.get(rid) ?? "Health snapshot",
          content: cm.content,
          created_at: cm.created_at,
          authorLabel: authors.get(cm.user_id) ?? "Someone",
        });
      }
    }

    const cards = (cardRows ?? []) as { id: string; title?: string | null; public_slug: string | null }[];
    if (cards.length > 0) {
      const cardIds = cards.map((c) => String(c.id));
      const slugByCard = new Map<string, string>();
      const titleByCard = new Map<string, string>();
      for (const c of cards) {
        const id = String(c.id);
        titleByCard.set(id, c.title?.trim() || "Custom card");
        const slug = c.public_slug?.trim();
        if (slug) slugByCard.set(id, slug);
      }
      const { data: sic } = await admin
        .from("shared_item_comments")
        .select("id, resource_id, content, created_at, user_id")
        .eq("resource_type", "custom_card")
        .in("resource_id", cardIds)
        .order("created_at", { ascending: false });
      const rows = (sic ?? []) as Array<{
        id: string;
        resource_id: string;
        content: string;
        created_at: string;
        user_id: string;
      }>;
      const authors = await buildAuthorMap(
        admin,
        rows.map((r) => r.user_id)
      );
      for (const cm of rows) {
        const rid = String(cm.resource_id);
        const slug = slugByCard.get(rid);
        if (!slug) continue;
        merged.push({
          id: `card-${rid}-${cm.id}`,
          commentId: String(cm.id),
          kind: "custom_card",
          resourceId: rid,
          title: titleByCard.get(rid) ?? "Custom card",
          content: cm.content,
          created_at: cm.created_at,
          authorLabel: authors.get(cm.user_id) ?? "Someone",
          customCardSlug: slug,
        });
      }
    }

    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ ok: true, items: merged });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("inbox-comments GET", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
