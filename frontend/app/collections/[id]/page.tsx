// app/collections/[id]/page.tsx
import Client from "./Client";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <Client collectionId={id} />;
}
