import React from "react";
import Link from "next/link";
import BinderClient from "@/components/BinderClient";
import { getBinderCollectionIdBySlug } from "@/lib/server/binder-resolve";

export const dynamic = "force-dynamic";

type Params = { slug: string };

export default async function Page(props: { params: Promise<Params> }) {
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const id = await getBinderCollectionIdBySlug(decodedSlug);
  if (!id) {
    const idAlt = slug !== decodedSlug ? await getBinderCollectionIdBySlug(slug) : null;
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
          <a className="text-xs underline" href={`${typeof process?.env?.NEXT_PUBLIC_SITE_URL === "string" ? process.env.NEXT_PUBLIC_SITE_URL : ""}/binder/${encodeURIComponent(slug)}`}>{slug}</a>
        </div>
        <BinderClient collectionId={idAlt} />
      </div>
    );
  }
  const origin = typeof process?.env?.NEXT_PUBLIC_SITE_URL === "string" ? process.env.NEXT_PUBLIC_SITE_URL : "";
  const url = `${origin || ""}/binder/${encodeURIComponent(slug)}`;
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
