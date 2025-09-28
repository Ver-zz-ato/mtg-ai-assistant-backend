// app/collections/[id]/page.tsx
import Client from "./Client";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <main className="max-w-3xl mx-auto p-6">
      <Client collectionId={id} />
    </main>
  );
}
