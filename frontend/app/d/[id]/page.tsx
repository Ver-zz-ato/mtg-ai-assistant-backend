import { createClient } from "@/lib/supabase/server";

export default async function DeckPublicPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id, title, public, deck_text, created_at")
    .eq("id", params.id)
    .single();

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-xl font-semibold mb-2">Deck not found</h1>
        <div className="text-gray-400 text-sm">{error.message}</div>
      </div>
    );
  }

  if (!data?.public) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-xl font-semibold mb-2">{data?.title || "Untitled deck"}</h1>
        <div className="text-yellow-400 text-sm">This deck is not public.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-3">{data?.title || "Untitled deck"}</h1>
      <pre className="rounded-lg border border-gray-800 bg-black/40 p-4 whitespace-pre-wrap text-sm leading-5">
        {data?.deck_text || "(empty deck list)"}
      </pre>
    </div>
  );
}
