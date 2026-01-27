import { createClient } from "@/lib/server-supabase";

const RESERVED = new Set([
  "admin","api","auth","binder","collections","decks","profile","privacy","terms","health","login","logout","signup","u","_next","assets","static","public"
]);

function normalize(s: string){
  return s.toLowerCase().trim().replace(/[^a-z0-9\-\s]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'');
}

export async function GET(req: Request){
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const slug = normalize(searchParams.get('slug')||'');
  const excludeCollectionId = searchParams.get('exclude') || '';
  if (!slug) return new Response(JSON.stringify({ ok:false, error:'invalid slug' }), { status:400, headers: { 'content-type':'application/json' } });
  if (RESERVED.has(slug)) return new Response(JSON.stringify({ ok:true, available:false, reason:'reserved' }), { headers: { 'content-type':'application/json' } });
  let query = supabase.from('collection_meta').select('collection_id').eq('public_slug', slug);
  if (excludeCollectionId) {
    query = query.neq('collection_id', excludeCollectionId);
  }
  const { data } = await query.maybeSingle();
  return new Response(JSON.stringify({ ok:true, available: !data }), { headers: { 'content-type':'application/json' } });
}