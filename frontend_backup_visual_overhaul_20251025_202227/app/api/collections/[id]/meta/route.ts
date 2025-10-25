import { createClient } from "@/lib/server-supabase";

const RESERVED = new Set([
  "admin","api","auth","binder","collections","decks","profile","privacy","terms","health","login","logout","signup","u","_next","assets","static","public"
]);

function normalizeSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Params = { id: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const supabase = await createClient();
  const { id } = await ctx.params;
  const { data: meta, error } = await supabase
    .from("collection_meta")
    .select("collection_id,is_public,public_slug,currency,visibility,data,updated_at")
    .eq("collection_id", id)
    .maybeSingle();
  if (error) return new Response(JSON.stringify({ ok:false, error: error.message }), { status: 500, headers: { 'content-type':'application/json' } });
  return new Response(JSON.stringify({ ok: true, meta: meta || { collection_id: id, is_public: false, public_slug: null } }), { headers: { 'content-type':'application/json' } });
}

export async function PUT(req: Request, ctx: { params: Promise<Params> }) {
  const supabase = await createClient();
  const { id } = await ctx.params;
  const body = await req.json().catch(()=>({}));
  let { is_public, public_slug } = body || {};

  if (typeof is_public !== 'boolean' && typeof public_slug !== 'string') {
    return new Response(JSON.stringify({ ok:false, error: 'No fields to update' }), { status: 400, headers: { 'content-type':'application/json' } });
  }

  if (typeof public_slug === 'string') {
    const norm = normalizeSlug(public_slug);
    if (!norm || norm.length < 3 || norm.length > 60) {
      return new Response(JSON.stringify({ ok:false, error: 'Invalid slug length' }), { status: 400, headers: { 'content-type':'application/json' } });
    }
    if (RESERVED.has(norm)) {
      return new Response(JSON.stringify({ ok:false, error: 'Slug is reserved' }), { status: 400, headers: { 'content-type':'application/json' } });
    }
    // Ensure uniqueness against other collections
    const { data: conflict } = await supabase
      .from('collection_meta')
      .select('collection_id')
      .eq('public_slug', norm)
      .neq('collection_id', id)
      .maybeSingle();
    if (conflict?.collection_id) {
      return new Response(JSON.stringify({ ok:false, error: 'Slug already taken' }), { status: 409, headers: { 'content-type':'application/json' } });
    }
    public_slug = norm;
  }

  // Upsert meta row
  const patch: any = {};
  if (typeof is_public === 'boolean') patch.is_public = is_public;
  if (typeof public_slug === 'string') patch.public_slug = public_slug || null;

  const { error: upErr, data: upData } = await supabase
    .from('collection_meta')
    .upsert({ collection_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'collection_id' })
    .select('*')
    .maybeSingle();

  if (upErr) return new Response(JSON.stringify({ ok:false, error: upErr.message }), { status: 500, headers: { 'content-type':'application/json' } });
  return new Response(JSON.stringify({ ok:true, meta: upData }), { headers: { 'content-type':'application/json' } });
}
