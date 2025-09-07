// frontend/app/collections/cost-to-finish/page.tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Client from "./Client";

function Inner() {
  const sp = useSearchParams();
  const deckId = sp.get("deck") ?? undefined;
  const collectionId = sp.get("collection") ?? undefined;

  return (
    <Client
      initialDeckId={deckId}
      initialCollectionId={collectionId}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
