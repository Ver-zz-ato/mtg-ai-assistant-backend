"use client";

import React from "react";
import { supabase } from "@/lib/supabaseClient";

type CollectionRow = {
  id: string;
  name: string;
};

export default function CostToFinishClient() {
  const [collections, setCollections] = React.useState<CollectionRow[] | null>(null);
  const [collectionsErr, setCollectionsErr] = React.useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);
  const [loadingCollections, setLoadingCollections] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingCollections(true);

        // Make sure we have a logged-in user first
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (!alive) return;

        if (userErr || !user) {
          setCollectionsErr("You must be signed in to load collections.");
          setCollections([]);
          setLoadingCollections(false);
          return;
        }

        // Now safely load collections for that user
        const { data, error } = await supabase
          .from("collections")
          .select("id, name")
          .eq("user_id", user.id) // extra safeguard, RLS already does this
          .order("name", { ascending: true });

        if (!alive) return;

        if (error) {
          console.error("Collections fetch error:", error);
          setCollectionsErr("Could not load collections.");
          setCollections([]);
        } else {
          setCollections(data ?? []);
          setCollectionsErr(null);
        }
      } catch (err) {
        if (!alive) return;
        console.error("Collections unexpected error:", err);
        setCollectionsErr("Unexpected error loading collections.");
        setCollections([]);
      } finally {
        if (alive) setLoadingCollections(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Options</h2>

      {/* Collections dropdown */}
      <div>
        <label className="block text-sm font-medium mb-1">Collection</label>
        {loadingCollections ? (
          <div className="text-sm text-gray-400">Loading collections…</div>
        ) : collectionsErr ? (
          <div className="text-sm text-red-500">{collectionsErr}</div>
        ) : (
          <select
            className="border rounded px-2 py-1 w-full bg-black text-white"
            value={selectedCollection ?? ""}
            onChange={(e) =>
              setSelectedCollection(e.target.value || null)
            }
          >
            <option value="">— None —</option>
            {collections?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Example: show what was selected */}
      {selectedCollection && (
        <div className="text-sm text-gray-300">
          Selected Collection: {selectedCollection}
        </div>
      )}
    </div>
  );
}
