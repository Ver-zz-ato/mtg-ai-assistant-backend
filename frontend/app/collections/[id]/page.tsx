// app/collections/[id]/page.tsx
import CollectionEditor from "@/components/CollectionEditor";
import Link from "next/link";
import CollectionHeaderControls from "@/components/CollectionHeaderControls";
import CollectionTitleBar from "@/components/CollectionTitleBar";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-[1760px] p-6">
      <div className="space-y-4">
        <header className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800/50">
            <CollectionTitleBar collectionId={id} />
            <Link href="/collections" className="px-4 py-2 rounded-lg bg-gradient-to-r from-neutral-700 to-neutral-600 hover:from-neutral-600 hover:to-neutral-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-neutral-600">
              Back to Collections
            </Link>
          </div>
          <div className="pb-3 border-b border-neutral-800/50">
            <CollectionHeaderControls collectionId={id} />
          </div>
        </header>
        <CollectionEditor collectionId={id} mode="page" />
      </div>
    </main>
  );
}
