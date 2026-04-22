import { NextRequest, NextResponse } from "next/server";
import { createClient, getServiceRoleClient } from "@/lib/supabase/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderSlugByName } from "@/lib/commanders";

function fallbackCommanderSlug(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const runtime = "nodejs";

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const cleanN = (s: string) => String(s || "").replace(/\s*\(.*?\)\s*$/, "").trim();

async function getDeckBannerUrl(
  supabase: any,
  deckId: string,
  presetMap?: Map<string, { art_crop?: string; normal?: string; small?: string }>
): Promise<string | undefined> {
  try {
    const { data } = await supabase.from("decks").select("title, commander, deck_text").eq("id", deckId).maybeSingle();
    if (!data) return undefined;
    const list: string[] = [];
    if (data.commander) list.push(cleanN(String(data.commander)));
    if (data.title) list.push(cleanN(String(data.title)));
    const lines = String(data.deck_text || "")
      .split(/\r?\n/)
      .map((x: string) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
    for (const line of lines) {
      const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      list.push(cleanN(m ? m[2] : line));
    }
    const { data: top } = await supabase
      .from("deck_cards")
      .select("name, qty")
      .eq("deck_id", deckId)
      .order("qty", { ascending: false })
      .limit(5);
    for (const r of (top as any[]) || []) list.push(cleanN(String(r.name)));
    const unique = Array.from(new Set(list));
    const m = presetMap || (await getImagesForNamesCached(unique));
    for (const n of unique) {
      const img = m.get(norm(n));
      if (img?.art_crop || img?.normal || img?.small) return img.art_crop || img.normal || img.small;
    }
  } catch {}
  return undefined;
}

function publicBaseFromRequest(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return (process.env.NEXT_PUBLIC_BASE_URL || "https://manatap.ai").replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl?.origin || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Public JSON for native app (and other clients). Mirrors data shown on /u/[slug] — no private fields.
 * GET /api/public-profile/{slug} — slug: username, exact id, or case-insensitive username (unique).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: raw } = await context.params;
    const slug = decodeURIComponent(raw);

    const profileClient = getServiceRoleClient() ?? (await createClient());

    let prof: any = null;
    try {
      const { data } = await profileClient.from("profiles_public").select("*").eq("username", slug).maybeSingle();
      prof = data || null;
    } catch {}
    if (!prof) {
      try {
        const { data: rows } = await profileClient
          .from("profiles_public")
          .select("*")
          .ilike("username", slug)
          .limit(2);
        if (Array.isArray(rows) && rows.length === 1) prof = rows[0];
      } catch {}
    }
    if (!prof) {
      try {
        const { data } = await profileClient.from("profiles_public").select("*").eq("id", slug).maybeSingle();
        prof = data || null;
      } catch {}
    }

    if (!prof || prof.is_public === false) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const db = getServiceRoleClient() ?? (await createClient());
    const userId = String(prof.id);

    let decks: any[] = [];
    try {
      const { data } = await db
        .from("decks")
        .select("id, title, updated_at, deck_text, commander")
        .eq("user_id", userId)
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(12);
      decks = Array.isArray(data) ? data : [];
    } catch {}

    // Public clients: no user-uploaded banner/avatar URLs (privacy; moderation).
    const bannerUrl: string | null = null;

    const cmdCounts: Record<string, number> = {};
    try {
      const { data: cmdRows } = await db
        .from("decks")
        .select("commander")
        .eq("user_id", userId)
        .eq("is_public", true);
      for (const r of (cmdRows as any[]) || []) {
        const n = String((r as any)?.commander || "").trim();
        if (n) cmdCounts[n] = (cmdCounts[n] || 0) + 1;
      }
    } catch {}
    const topList = Object.entries(cmdCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const topCmdImgs = await getImagesForNamesCached(topList.map(([n]) => n));
    const topCommanders = topList.map(([name, count]) => {
      const img = topCmdImgs.get(norm(name));
      const art = img?.art_crop || img?.normal || img?.small || null;
      const catalogGuide = getCommanderSlugByName(name);
      const guideSlug = catalogGuide ?? fallbackCommanderSlug(name);
      return { name, count, artUrl: art, guideSlug, hasCatalogGuide: catalogGuide != null };
    });

    const favoriteRaw = prof.favorite_commander ? String(prof.favorite_commander).trim() : "";
    const featuredName = favoriteRaw || (topList[0]?.[0] ?? "");
    let featuredCommander: {
      name: string;
      count: number;
      artUrl: string | null;
      guideSlug: string;
      hasCatalogGuide: boolean;
    } | null = null;
    if (featuredName) {
      const count = (cmdCounts as Record<string, number>)[featuredName] ?? 0;
      const imgHit = topCmdImgs.get(norm(featuredName));
      let art: string | null = imgHit?.art_crop || imgHit?.normal || imgHit?.small || null;
      if (!art) {
        const extra = await getImagesForNamesCached([featuredName]);
        const v = extra.get(norm(featuredName));
        art = v?.art_crop || v?.normal || v?.small || null;
      }
      const catalog = getCommanderSlugByName(featuredName);
      featuredCommander = {
        name: featuredName,
        count,
        artUrl: art,
        guideSlug: catalog ?? fallbackCommanderSlug(featuredName),
        hasCatalogGuide: catalog != null,
      };
    }

    const allNames: string[] = [];
    for (const d of decks) {
      if (d.commander) allNames.push(cleanN(String(d.commander)));
      if (d.title) allNames.push(cleanN(String(d.title)));
    }
    const deckImgMap = await getImagesForNamesCached(Array.from(new Set(allNames)));

    const recentDecksRaw = await Promise.all(
      decks.map(async (d) => {
        const candidates: string[] = [];
        if (d.commander) candidates.push(cleanN(String(d.commander)));
        if (d.title) candidates.push(cleanN(String(d.title)));
        const first = String(d.deck_text || "")
          .split(/\r?\n/)
          .find((l: string) => !!l?.trim());
        if (first) {
          const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
          candidates.push(cleanN(m ? m[2] : first));
        }
        let artUrl: string | null = null;
        for (const c of candidates) {
          const img = deckImgMap.get(norm(c));
          if (img?.art_crop || img?.normal || img?.small) {
            artUrl = img.art_crop || img.normal || img.small || null;
            break;
          }
        }
        if (!artUrl) {
          const b = await getDeckBannerUrl(db, d.id, deckImgMap);
          artUrl = b || null;
        }
        return {
          id: d.id,
          title: d.title || "Untitled",
          commander: d.commander || null,
          artUrl,
        };
      })
    );

    const likeByDeck: Record<string, number> = {};
    const deckIdsForLikes = recentDecksRaw.map((x) => x.id).filter(Boolean);
    if (deckIdsForLikes.length) {
      try {
        const { data: likeRows } = await db
          .from("deck_likes")
          .select("deck_id")
          .in("deck_id", deckIdsForLikes);
        for (const row of (likeRows as any[]) || []) {
          const id = String((row as any)?.deck_id ?? "");
          if (!id) continue;
          likeByDeck[id] = (likeByDeck[id] || 0) + 1;
        }
      } catch {}
    }

    const recentDecks = recentDecksRaw.map((d) => ({
      ...d,
      likeCount: likeByDeck[d.id] ?? 0,
    }));

    const pinIds: string[] = Array.isArray(prof.pinned_deck_ids) ? prof.pinned_deck_ids.slice(0, 8) : [];
    let pinnedDecks: { id: string; title: string }[] = [];
    if (pinIds.length) {
      try {
        const { data: pinRows } = await db
          .from("decks")
          .select("id, title")
          .in("id", pinIds)
          .eq("user_id", userId)
          .eq("is_public", true);
        const map = new Map((Array.isArray(pinRows) ? pinRows : []).map((r: any) => [r.id, r.title as string]));
        pinnedDecks = pinIds
          .map((id) => ({ id, title: String(map.get(id) || "Untitled") }))
          .filter((p) => p.id);
      } catch {}
    }

    const base = publicBaseFromRequest(request);
    const pathSlug = encodeURIComponent((prof.username as string) || userId);
    const canonicalUrl = `${base}/u/${pathSlug}`;

    return NextResponse.json(
      {
        ok: true,
        canonicalUrl,
        profile: {
          id: prof.id,
          username: prof.username,
          display_name: prof.display_name,
          avatar: null,
          is_pro: !!prof.is_pro,
          favorite_commander: prof.favorite_commander,
          favorite_formats: prof.favorite_formats,
          colors: prof.colors,
          deck_count: prof.deck_count,
          collection_count: prof.collection_count,
          messages_30d: prof.messages_30d,
          badges: Array.isArray(prof.badges) ? prof.badges : [],
          pinned_badges: prof.pinned_badges,
          custom_card: null,
        },
        bannerUrl,
        recentDecks,
        topCommanders,
        featuredCommander,
        pinnedDecks,
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
