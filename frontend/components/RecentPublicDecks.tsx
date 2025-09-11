// components/RecentPublicDecks.tsx
import Link from "next/link";

type Row = {
  id: string;
  title?: string | null;
  updated_at?: string | null;
};

export default async function RecentPublicDecks({ limit = 12 }: { limit?: number }) {
  const base =
    (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");

  const url = `${base}/api/decks/recent?limit=${encodeURIComponent(String(limit))}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  const json = await res.json();
  const decks: Row[] = json?.decks || [];

  if (!res.ok || json?.ok === false) {
    return <div className="text-sm text-red-500">Failed to load recent decks.</div>;
  }

  if (!decks.length) {
    return (
      <div className="rounded-xl border border-gray-800 p-4">
        <div className="text-sm font-semibold mb-2">Recent Public Decks</div>
        <div className="text-xs text-muted-foreground">No public decks yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 p-4">
      <div className="text-sm font-semibold mb-2">Recent Public Decks</div>
      <ul className="space-y-2">
        {decks.map((d) => (
          <li key={d.id} className="border rounded-md p-3 hover:bg-accent">
            <Link href={`/decks/${d.id}`} prefetch className="block">
              <div className="text-base font-semibold line-clamp-1">
                {d.title ?? "Untitled deck"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(d.updated_at ?? Date.now()).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
