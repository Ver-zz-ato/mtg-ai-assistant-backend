// components/RecentPublicDecks.tsx
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

type Row = {
  id: string;
  title?: string | null;
  updated_at?: string | null;
};

// Cookie-free Supabase client for public data (safe to run at build/prerender)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const getRecent = unstable_cache(
  async (limit: number) => {
    const { data, error } = await supabase
      .from("decks")
      .select("id, title, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit || 12, 1), 24));
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  },
  ["recent_public_decks"],
  { revalidate: 30 }
);

export default async function RecentPublicDecks({ limit = 12 }: { limit?: number }) {
  let decks: Row[] = [];
  try {
    decks = await getRecent(limit);
  } catch (e) {
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
