"use client";

export const dynamic = "force-dynamic";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CostToFinishClient from "./Client";

function Inner() {
  const params = useSearchParams();
  const deckId = params.get("deck");
  const collectionId = params.get("collection");
  return <CostToFinishClient deckId={deckId} collectionId={collectionId} />;
}

export default function CostToFinishPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
