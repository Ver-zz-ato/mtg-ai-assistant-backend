import ManualDeckFromCollectionClient from "@/components/manual-build/ManualDeckFromCollectionClient";

type Params = { id: string };

export default async function ManualBuildFromCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ format?: string; commander?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <ManualDeckFromCollectionClient
        collectionId={id}
        initialFormat={sp.format ?? null}
        initialCommander={sp.commander ?? null}
      />
    </main>
  );
}
