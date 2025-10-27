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
  if (!slug) return new Response(JSON.stringify({ ok:false, error:'invalid slug' }), { status:400, headers: { 'content-type':'application/json' } });
  if (RESERVED.has(slug)) return new Response(JSON.stringify({ ok:true, available:false, reason:'reserved' }), { headers: { 'content-type':'application/json' } });
  const { data } = await supabase.from('collection_meta').select('collection_id').eq('public_slug', slug).maybeSingle();
  return new Response(JSON.stringify({ ok:true, available: !data }), { headers: { 'content-type':'application/json' } });
}