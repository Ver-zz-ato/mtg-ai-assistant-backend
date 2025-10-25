import React from "react";
import { createClient } from "@/lib/server-supabase";
import Link from "next/link";
import BinderClient from "@/components/BinderClient";

export const dynamic = "force-dynamic";

async function getBySlug(slug: string){
  const supabase = await createClient();
  // Resolve slug -> collection id if public
  const { data, error } = await supabase
    .from('collection_meta')
    .select('collection_id,is_public,public_slug')
    .eq('public_slug', slug)
    .maybeSingle();
  if (error || !data || !data.is_public) return null;
  return data.collection_id as string;
}

type Params = { slug: string };

export default async function Page(props: { params: Promise<Params> }){
  const { slug } = await props.params;
  const id = await getBySlug(slug);
  if (!id) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Binder not found</h1>
        <p className="opacity-80">This public binder either does not exist or is not publicly visible.</p>
        <p className="mt-4"><Link className="underline" href="/collections">Back to Collections</Link></p>
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