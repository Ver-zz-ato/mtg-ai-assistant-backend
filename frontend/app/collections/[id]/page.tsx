// app/collections/[id]/page.tsx
import CollectionEditor from "@/components/CollectionEditor";
import Link from "next/link";
import { capture } from "@/lib/ph";
import CollectionHeaderControls from "@/components/CollectionHeaderControls";
import CollectionTitleBar from "@/components/CollectionTitleBar";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  // Fire a simple telemetry event client-side via a small inline script (safe no-op if capture missing)
  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <CollectionTitleBar collectionId={id} />
          <Link href={`/collections`} className="px-4 py-2 rounded-lg bg-gradient-to-r from-neutral-700 to-neutral-600 hover:from-neutral-600 hover:to-neutral-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-neutral-600">Back to Collections</Link>
        </div>
        <CollectionHeaderControls collectionId={id} />
      </header>
      <CollectionEditor collectionId={id} mode="page" />
      {/* PostHog tracking handled client-side in CollectionEditor component */}
    </main>
  );
}
