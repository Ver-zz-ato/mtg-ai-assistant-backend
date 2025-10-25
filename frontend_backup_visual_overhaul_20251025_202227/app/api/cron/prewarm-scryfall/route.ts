import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getImagesForNamesCached, getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

function clean(s: string) {
  return String(s || "").replace(/\s*\(.*?\)\s*$/, "").trim();
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  // Allow either: CRON header OR signed-in admin user
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";

  let useAdmin = false;
  let actor: string | null = null;

  if (cronKey && hdr === cronKey) {
    useAdmin = true;
    actor = 'cron';
  } else {
    try {
      const sb = await getServerSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (user && isAdmin(user)) {
        useAdmin = true;
        actor = user.id as string;
      }
    } catch {}
  }

  if (!useAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // Use normal server supabase for reading (RLS should allow public), service-role for writes
    const supabase = await createClient();

    // 1) Popular commanders: approximate by counting commanders among recent public decks
    const { data: decks } = await supabase
      .from("decks")
      .select("id, title, commander, deck_text")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    const rows = Array.isArray(decks) ? (decks as any[]) : [];

    const names = new Set<string>();
    for (const d of rows) {
      if (d.commander) names.add(clean(String(d.commander)));
      if (d.title) names.add(clean(String(d.title)));
      const first = String(d.deck_text || "").split(/\r?\n/).find((l: string) => !!l?.trim());
      if (first) {
        const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
        names.add(clean(m ? m[2] : first));
      }
    }

    // 2) For coverage, grab top few cards per deck
    const results = await Promise.all(
      rows.map(async (d) => {
        const { data } = await supabase
          .from("deck_cards")
          .select("name, qty")
          .eq("deck_id", d.id)
          .order("qty", { ascending: false })
          .limit(5);
        const nm = Array.isArray(data) ? (data as any[]).map((x) => String(x.name)) : [];
        return nm;
      })
    );
    for (const arr of results) for (const n of arr) names.add(clean(n));

    const list = Array.from(names).slice(0, 400);
    // Warm both images and details paths; helpers will upsert and respect TTL
    await getImagesForNamesCached(list);
    await getDetailsForNamesCached(list);

    // Record last run in app_config and audit log (service role)
    try {
      const admin = getAdmin();
      if (admin) {
        await admin.from('app_config').upsert({ key: 'job:last:prewarm_scryfall', value: new Date().toISOString() }, { onConflict: 'key' });
        await admin.from('admin_audit').insert({ actor_id: actor || 'cron', action: 'cron_prewarm_scryfall', target: list.length });
      }
    } catch {}

    return NextResponse.json({ ok: true, warmed: list.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
