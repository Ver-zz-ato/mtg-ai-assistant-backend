// Simplified my-decks without heavy operations
import { createClient } from "@/lib/supabase/server";

export default async function SimpleMyDecks() {
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
    .select("id, title, commander, created_at, updated_at, is_public")
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

  const rows = data || [];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks (Simplified)</h1>
        <div>
          <a href="/new-deck" className="px-4 py-2 bg-blue-600 text-white rounded">New Deck</a>
        </div>
      </div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((r) => {
          const title = r.title ?? "Untitled Deck";
          const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
          
          return (
            <div key={r.id} className="relative border rounded overflow-hidden group bg-neutral-950 min-h-[96px]">
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
              <div className="relative flex items-center justify-between">
                <div className="flex-1 min-w-0 p-3">
                  <div className="font-medium truncate">{title}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {r.updated_at ? `Updated ${new Date(r.updated_at).toLocaleDateString()}` : ''}
                    {r.created_at ? ` • Created ${new Date(r.created_at).toLocaleDateString()}` : ''}
                  </div>
                  {r.commander && (
                    <div className="text-xs text-blue-300 mt-1">Commander: {r.commander}</div>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${r.is_public ? 'bg-green-600' : 'bg-gray-600'}`}>
                    {r.is_public ? 'Public' : 'Private'}
                  </span>
                  <a href={`/my-decks/${encodeURIComponent(r.id)}`} className="text-xs px-2 py-1 rounded border border-neutral-700">
                    Edit
                  </a>
                  <a href={`/decks/${encodeURIComponent(r.id)}`} className="text-xs px-2 py-1 rounded border border-neutral-700">
                    View
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded">
        <h3 className="font-semibold mb-2">🧪 Debug Info</h3>
        <p>This simplified version removes:</p>
        <ul className="list-disc list-inside text-sm space-y-1">
          <li>Image processing (getImagesForNamesCached)</li>
          <li>Dynamic component imports (require calls)</li>
          <li>Complex deck card queries</li>
          <li>Pinned deck loading</li>
        </ul>
        <div className="mt-2">
          <a href="/my-decks" className="underline">Try original complex page →</a>
        </div>
      </div>
    </div>
  );
}