// app/my-decks/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
};

async function deleteDeck(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return;

  // Ensure ownership
  const { data: deck, error: dErr } = await supabase
    .from("decks")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (dErr || !deck || deck.user_id !== user.id) return;

  // Delete children then deck (no cascade assumed)
  await supabase.from("deck_cards").delete().eq("deck_id", id);
  await supabase.from("decks").delete().eq("id", id);

  revalidatePath("/my-decks");
}

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
        <Link href="/new-deck" className="text-sm underline underline-offset-4">New Deck</Link>
      </div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const title = r.title ?? "Untitled deck";
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
                <form action={deleteDeck}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-sm text-red-500 underline" title="Delete deck">Delete</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
