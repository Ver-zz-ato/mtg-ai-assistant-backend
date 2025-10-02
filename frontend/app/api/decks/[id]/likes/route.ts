import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";
import { sameOriginOk } from "@/lib/api/csrf";

export const runtime = "nodejs";

type Params = { id: string };

function ipHashFromReq(req: NextRequest): string | null {
  try {
    const fwd = req.headers.get('x-forwarded-for') || '';
    const ip = fwd.split(',')[0].trim() || '';
    if (!ip) return null;
    return crypto.createHash('sha256').update(ip).digest('hex');
  } catch { return null; }
}

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // fetch count and whether current user liked
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user ?? null;
  let count = 0, liked = false;
  try {
    const { count: c } = await supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', id);
    count = c || 0;
  } catch {}
  if (user) {
    try {
      const { count: c } = await supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', id).eq('user_id', user.id);
      liked = (c||0) > 0;
    } catch {}
  }
  return NextResponse.json({ ok: true, count, liked });
}

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    if (!sameOriginOk(req)) return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
    const body = await req.json().catch(()=>({}));
    const action = (body?.action || 'toggle') as 'like'|'unlike'|'toggle';

    // Windowed rate limit: 20 actions / 5 minutes per user and per IP
    try {
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const ipHash = ipHashFromReq(req);
      const [{ count: uCount }, { count: ipCount }] = await Promise.all([
        supabase.from('likes_audit').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', cutoff),
        ipHash ? supabase.from('likes_audit').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', cutoff) : Promise.resolve({ count: 0 }) as any,
      ]);
      const over = (uCount||0) >= 20 || (ipCount||0) >= 20;
      if (over) {
        const retryAfter = 120; // seconds; hint for backoff UI
        console.log(JSON.stringify({ tag: 'likes_rate_limit', deck_id: id, user_id: user.id, ip_hash: ipHash, uCount, ipCount, window: '5m' }));
        return NextResponse.json({ ok: false, error: 'rate_limited', retry_after_seconds: retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
      }
    } catch {}

    // Determine current like state
    const { count: exists } = await supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', id).eq('user_id', user.id);

    const ipHash = ipHashFromReq(req);

    if ((action === 'toggle' && (exists||0) > 0) || action === 'unlike') {
      await supabase.from('deck_likes').delete().eq('deck_id', id).eq('user_id', user.id);
    } else if (action === 'like' || action === 'toggle') {
      await supabase.from('deck_likes').insert({ deck_id: id, user_id: user.id, ip_hash: ipHash });
    }

    // Audit
    try { await supabase.from('likes_audit').insert({ deck_id: id, user_id: user.id, ip_hash: ipHash, action }); } catch {}

    const [{ count: c }, { count: lc }] = await Promise.all([
      supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', id),
      supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', id).eq('user_id', user.id),
    ]);
    return NextResponse.json({ ok: true, count: c||0, liked: (lc||0) > 0 });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
