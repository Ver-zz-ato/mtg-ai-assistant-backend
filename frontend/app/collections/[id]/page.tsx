// app/collections/[id]/page.tsx
import CollectionEditor from "@/components/CollectionEditor";
import Link from "next/link";
import { Suspense } from "react";
import CollectionHeaderControls from "@/components/CollectionHeaderControls";
import CollectionTitleBar from "@/components/CollectionTitleBar";
import BuildDeckFromCollectionPanel from "@/components/BuildDeckFromCollectionPanel";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <header className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800/50">
              <CollectionTitleBar collectionId={id} />
              <Link href={`/collections`} className="px-4 py-2 rounded-lg bg-gradient-to-r from-neutral-700 to-neutral-600 hover:from-neutral-600 hover:to-neutral-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-neutral-600">Back to Collections</Link>
            </div>
            <div className="pb-3 border-b border-neutral-800/50">
              <CollectionHeaderControls collectionId={id} />
            </div>
          </header>
          <CollectionEditor collectionId={id} mode="page" />
        </div>
        <aside className="lg:w-[360px] shrink-0">
          <div className="lg:sticky lg:top-6">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
                  Loading build options…
                </div>
              }
            >
              <BuildDeckFromCollectionPanel collectionId={id} />
            </Suspense>
          </div>
        </aside>
      </div>
    </main>
  );
}
