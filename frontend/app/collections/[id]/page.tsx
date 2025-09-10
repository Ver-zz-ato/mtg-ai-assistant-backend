// app/collections/[id]/page.tsx
import Client from "./Client";

function getBaseUrl() {
  // Prefer explicit base; fall back to Vercel URL; then localhost for dev
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function fetchCards(collectionId: string) {
  const base = getBaseUrl();
  const url = `${base}/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { ok: false, items: [] as any[] };
  return res.json();
}

// NOTE: Next 15: params is now a Promise for dynamic segments; await it
export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchCards(id);
  const items = Array.isArray(data?.items) ? data.items : [];
  return <Client collectionId={id} initialItems={items} />;
}
