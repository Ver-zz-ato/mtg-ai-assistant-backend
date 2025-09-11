// components/RecentPublicDecks.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function RecentPublicDecks({ limit = 12 }: { limit?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recent_public_decks")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return <div className="text-sm text-red-500">Failed to load recent decks.</div>;
  }

  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground">No public decks yet.</div>;
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.map((d) => (
        <li key={d.id} className="border rounded-md p-3 hover:bg-accent">
          <Link href={`/decks/${d.id}`} className="block">
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
  );
}
