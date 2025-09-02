// app/my-decks/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MyDecksPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold mb-2">My Decks</h1>
        <p className="text-gray-300">Please log in to view your saved decks.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, format, colors, created_at, is_public")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold mb-2">My Decks</h1>
        <p className="text-red-400">Error loading decks.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-4">My Decks</h1>
      {!data || data.length === 0 ? (
        <div className="text-gray-300">You haven’t saved any decks yet.</div>
      ) : (
        <ul className="space-y-3">
          {data.map((d) => (
            <li key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-sm text-gray-400">
                  {d.format} · {Array.isArray(d.colors) ? d.colors.join("") : ""} ·{" "}
                  {new Date(d.created_at).toLocaleString()} {d.is_public ? "· public" : "· private"}
                </div>
              </div>
              {/* placeholder for deck page (later) */}
              <Link
                href="#"
                className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700"
                title="Deck details coming soon"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
