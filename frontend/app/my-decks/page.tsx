// app/my-decks/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewDeckInline from "@/components/NewDeckInline";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
};

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-sm">Please sign in to see your decks.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, created_at")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const rows: DeckRow[] = (data || []) as any;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <NewDeckInline />
      </div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const title = r.title ?? "Untitled Deck";
          const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
          return (
            <li key={r.id} className="border rounded p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{title}</div>
                <div className="text-xs text-gray-500">{created}</div>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/my-decks/${encodeURIComponent(r.id)}`} className="text-sm underline underline-offset-4" title="Edit deck">Edit</Link>
                <Link href={`/decks/${encodeURIComponent(r.id)}`} className="text-sm underline underline-offset-4" title="View deck">View</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
