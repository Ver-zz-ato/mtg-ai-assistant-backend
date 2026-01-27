import React from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import BinderClient from "@/components/BinderClient";

export const dynamic = "force-dynamic";

async function getBySlug(slug: string){
  // Use service role client to bypass RLS for public binder lookup
  // This is safe because we only query collections with is_public=true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Prefer service role (bypasses RLS), fallback to anon key
  const supabase = serviceKey 
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, anonKey, { auth: { persistSession: false } });
  // Resolve slug -> collection id if public
  // Select both is_public and visibility to check both
  // Filter by is_public=true to ensure we only get public collections
  let { data, error } = await supabase
    .from('collection_meta')
    .select('collection_id,is_public,public_slug,visibility')
    .eq('public_slug', slug)
    .eq('is_public', true) // Only query public collections
    .maybeSingle();
  
  // Debug logging
  console.log(`[Binder] Looking up slug: "${slug}"`);
  console.log(`[Binder] Direct query result:`, data ? { 
    id: data.collection_id, 
    is_public: data.is_public, 
    visibility: data.visibility,
    slug: data.public_slug 
  } : 'null', 'error:', error);
  
  // If not found, try case-insensitive match (in case of normalization issues)
  if (!data && !error) {
    console.log(`[Binder] No direct match, trying case-insensitive search...`);
    const { data: allMeta, error: allError } = await supabase
      .from('collection_meta')
      .select('collection_id,is_public,public_slug,visibility')
      .eq('is_public', true) // Only query public collections
      .not('public_slug', 'is', null);
    
    console.log(`[Binder] Found ${(allMeta || []).length} collections with slugs`);
    
    // Find case-insensitive match
    const match = (allMeta || []).find((m: any) => {
      const storedSlug = String(m.public_slug || '').toLowerCase();
      const searchSlug = slug.toLowerCase();
      return storedSlug === searchSlug;
    });
    
    if (match) {
      console.log(`[Binder] Found case-insensitive match:`, match);
      data = match;
      error = null;
    } else {
      // Log all slugs for debugging
      const allSlugs = (allMeta || []).slice(0, 10).map((m: any) => m.public_slug);
      console.log(`[Binder] Sample slugs in DB:`, allSlugs);
    }
  }
  
  if (error || !data) {
    console.log(`[Binder] No data found for slug: "${slug}"`);
    return null;
  }
  
  // Check if collection is public (either is_public=true OR visibility='public')
  const isPublic = data.is_public === true || data.visibility === 'public';
  
  console.log(`[Binder] Collection ${data.collection_id} - is_public: ${data.is_public}, visibility: ${data.visibility}, isPublic: ${isPublic}`);
  
  if (!isPublic) {
    console.log(`[Binder] Collection ${data.collection_id} is not public (is_public: ${data.is_public}, visibility: ${data.visibility})`);
    return null;
  }
  
  console.log(`[Binder] ✅ Successfully resolved slug "${slug}" to collection ${data.collection_id}`);
  return data.collection_id as string;
}

type Params = { slug: string };

export default async function Page(props: { params: Promise<Params> }){
  const { slug } = await props.params;
  // Decode the slug in case it's URL encoded
  const decodedSlug = decodeURIComponent(slug);
  console.log(`[Binder] Page - received slug: "${slug}", decoded: "${decodedSlug}"`);
  
  const id = await getBySlug(decodedSlug);
  if (!id) {
    // Try with original slug too (in case decoding wasn't needed)
    const idAlt = slug !== decodedSlug ? await getBySlug(slug) : null;
    if (!idAlt) {
      return (
        <div className="max-w-3xl mx-auto p-6">
          <h1 className="text-xl font-semibold mb-2">Binder not found</h1>
          <p className="opacity-80">This public binder either does not exist or is not publicly visible.</p>
          <p className="mt-4"><Link className="underline" href="/collections">Back to Collections</Link></p>
        </div>
      );
    }
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Public Binder View</h1>
          <span className="ml-auto text-xs opacity-70">Share URL:</span>
          <a className="text-xs underline" href={`${typeof process?.env?.NEXT_PUBLIC_SITE_URL === 'string' ? process.env.NEXT_PUBLIC_SITE_URL : ''}/binder/${encodeURIComponent(slug)}`}>{slug}</a>
        </div>
        <BinderClient collectionId={idAlt} />
      </div>
    );
  }
  const origin = typeof process?.env?.NEXT_PUBLIC_SITE_URL === 'string' ? process.env.NEXT_PUBLIC_SITE_URL : '';
  const url = `${origin || ''}/binder/${encodeURIComponent(slug)}`;
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Public Binder View</h1>
        <span className="ml-auto text-xs opacity-70">Share URL:</span>
        <a className="text-xs underline" href={url}>{url}</a>
      </div>
      <BinderClient collectionId={id} />
    </div>
  );
}