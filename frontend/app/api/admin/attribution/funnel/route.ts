import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const admin = getAdmin();
    const db = admin ?? supabase;

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: attrRows } = await db.from('user_attribution').select('anon_id, initial_pathname, initial_referrer_domain');
    const attrByAnon = new Map<string, { pathname: string; referrer: string | null }>();
    for (const r of attrRows || []) {
      attrByAnon.set(r.anon_id, { pathname: r.initial_pathname || '/', referrer: r.initial_referrer_domain });
    }

    const { data: usageRows } = await db
      .from('ai_usage')
      .select('id, anon_id, cost_usd')
      .gte('created_at', cutoff)
      .not('anon_id', 'is', null);

    const usageByAnon = new Map<string, { count: number; cost: number }>();
    for (const r of usageRows || []) {
      const aid = r.anon_id;
      if (!aid) continue;
      const cur = usageByAnon.get(aid) || { count: 0, cost: 0 };
      cur.count += 1;
      cur.cost += Number(r.cost_usd) || 0;
      usageByAnon.set(aid, cur);
    }

    const landingByPath = new Map<string, { ai_requests: number; unique_users: Set<string>; total_cost: number }>();
    const referrerByDomain = new Map<string, { ai_requests: number; unique_users: Set<string> }>();
    const repeatByPath = new Map<string, Set<string>>();
    const commanderByPath = new Map<string, { ai_requests: number; unique_users: Set<string> }>();

    for (const [anonId, usage] of usageByAnon.entries()) {
      const attr = attrByAnon.get(anonId);
      if (!attr) continue;

      const pathname = attr.pathname;
      const referrer = attr.referrer ?? '(direct)';

      if (!landingByPath.has(pathname)) landingByPath.set(pathname, { ai_requests: 0, unique_users: new Set(), total_cost: 0 });
      const lp = landingByPath.get(pathname)!;
      lp.ai_requests += usage.count;
      lp.unique_users.add(anonId);
      lp.total_cost += usage.cost;

      if (!referrerByDomain.has(referrer)) referrerByDomain.set(referrer, { ai_requests: 0, unique_users: new Set() });
      const rd = referrerByDomain.get(referrer)!;
      rd.ai_requests += usage.count;
      rd.unique_users.add(anonId);

      if (usage.count >= 2) {
        if (!repeatByPath.has(pathname)) repeatByPath.set(pathname, new Set());
        repeatByPath.get(pathname)!.add(anonId);
      }

      if (pathname.startsWith('/commanders/')) {
        if (!commanderByPath.has(pathname)) commanderByPath.set(pathname, { ai_requests: 0, unique_users: new Set() });
        const cp = commanderByPath.get(pathname)!;
        cp.ai_requests += usage.count;
        cp.unique_users.add(anonId);
      }
    }

    const landingPages = Array.from(landingByPath.entries())
      .map(([pathname, v]) => ({ initial_pathname: pathname, ai_requests: v.ai_requests, unique_users: v.unique_users.size, total_cost: Math.round(v.total_cost * 10000) / 10000 }))
      .sort((a, b) => b.ai_requests - a.ai_requests)
      .slice(0, 50);

    const referrers = Array.from(referrerByDomain.entries())
      .map(([domain, v]) => ({ initial_referrer_domain: domain, ai_requests: v.ai_requests, unique_users: v.unique_users.size }))
      .sort((a, b) => b.ai_requests - a.ai_requests)
      .slice(0, 50);

    const repeatUsage = Array.from(repeatByPath.entries())
      .map(([pathname, users]) => ({ initial_pathname: pathname, repeat_users: users.size }))
      .sort((a, b) => b.repeat_users - a.repeat_users)
      .slice(0, 50);

    const commanderFunnel = Array.from(commanderByPath.entries())
      .map(([pathname, v]) => ({ initial_pathname: pathname, ai_requests: v.ai_requests, unique_users: v.unique_users.size }))
      .sort((a, b) => b.ai_requests - a.ai_requests);

    return NextResponse.json({
      ok: true,
      landingPages,
      referrers,
      repeatUsage,
      commanderFunnel,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'server_error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
