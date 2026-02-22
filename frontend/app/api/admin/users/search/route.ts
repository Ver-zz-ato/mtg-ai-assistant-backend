import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}
function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }

export async function GET(req: NextRequest){
  try{
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok:false, error:"forbidden" }, { status:403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error:"missing_service_role_key" }, { status:500 });

    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(100, Math.max(10, parseInt(req.nextUrl.searchParams.get("perPage") || "50", 10) || 50));

    // When searching, fetch multiple pages (auth has no native search). Otherwise single page.
    const authUsers: any[] = [];
    if (q) {
      for (let p = 1; p <= 10; p++) {
        const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage });
        if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
        const batch = data?.users || [];
        authUsers.push(...batch);
        if (batch.length < perPage) break;
      }
    } else {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
      authUsers.push(...(data?.users || []));
    }
    const userIds = authUsers.map((u:any) => u.id);
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, users: [], total: 0, page, perPage });
    }

    // Fetch profiles (Pro status, Stripe, etc.) - profiles table has id, username, is_pro, pro_plan, stripe_*, pro_since (no email/display_name)
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, username, is_pro, pro_plan, stripe_subscription_id, stripe_customer_id, pro_since, created_at')
      .in('id', userIds);
    if (profilesError) return NextResponse.json({ ok: false, error: `Database error finding users: ${profilesError.message}` }, { status: 500 });
    const profilesMap = new Map((profiles || []).map((p:any) => [p.id, p]));

    // Deck counts per user
    const { data: deckCounts } = await admin
      .from('decks')
      .select('user_id')
      .in('user_id', userIds);
    const countByUser = new Map<string, number>();
    for (const d of deckCounts || []) {
      const uid = (d as any).user_id;
      if (uid) countByUser.set(uid, (countByUser.get(uid) || 0) + 1);
    }

    const needle = norm(q);
    const users = authUsers.map((u:any) => {
      const um = (u?.user_metadata || {}) as any;
      const profile = profilesMap.get(u.id);
      const username = profile?.username || um.username || um.display_name || null;
      const displayName = profile?.display_name || um.display_name || um.username || null;
      const emailVal = profile?.email || u.email || null;
      const pro = profile ? !!profile.is_pro : !!um.pro;
      const pro_plan = profile?.pro_plan || null;
      const billing_active = !!um.billing_active;
      const created_at = u.created_at || null;
      const last_sign_in_at = u.last_sign_in_at || null;
      const deck_count = countByUser.get(u.id) ?? 0;
      const stripe_subscription_id = profile?.stripe_subscription_id || null;
      const stripe_customer_id = profile?.stripe_customer_id || null;
      return {
        id: u.id,
        email: emailVal,
        username,
        display_name: displayName,
        avatar: um.avatar || um.avatar_url || null,
        pro,
        pro_plan,
        billing_active,
        created_at,
        last_sign_in_at,
        deck_count,
        stripe_subscription_id,
        stripe_customer_id,
        pro_since: profile?.pro_since || null,
      } as any;
    }).filter((u:any) => {
      if (!needle) return true;
      return [u.id, u.email, u.username, u.display_name].some(v => norm(v||"").includes(needle));
    });

    return NextResponse.json({
      ok: true,
      users,
      total: users.length,
      page,
      perPage,
      hasMore: !q && authUsers.length >= perPage,
    });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"server_error" }, { status:500 });
  }
}