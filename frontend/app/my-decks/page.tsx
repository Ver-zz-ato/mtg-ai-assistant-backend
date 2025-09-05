import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type DeckRow = {
  id: string;
  name?: string | null;
  format?: string | null;
  commander?: string | null;
  data?: any | null;
  meta?: any | null;
  created_at?: string | null;
};

function guessCommander(row: DeckRow): string | null {
  if (row.commander) return String(row.commander);
  const m =
    row.meta?.commander ??
    row.meta?.leader ??
    row.meta?.general ??
    row.data?.commander ??
    row.data?.leaders?.[0] ??
    row.data?.identity?.commander ??
    null;
  return m ? String(m) : null;
}

export const dynamic = "force-dynamic";

export default async function MyDecksPage() {
  const supabase = createClient();

  // ✅ No updated_at dependency
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const rows = (data ?? []) as DeckRow[];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div className="flex items-center gap-3">
          <Link href="/collections" className="text-sm underline underline-offset-4">
            Collections
          </Link>
          <Link href="/collections/cost-to-finish" className="text-sm underline underline-offset-4">
            Cost to Finish
          </Link>
        </div>
      </div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const commander = guessCommander(r);
          const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
          return (
            <li key={r.id} className="border rounded p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name ?? "Untitled deck"}</div>
                <div className="text-xs text-gray-500">
                  {(r.format ?? "Commander") + (commander ? ` • ${commander}` : "")}
                </div>
                {created && <div className="text-[10px] text-gray-500">{created}</div>}
              </div>

              {/* ✅ Link to the real page, not the POST API */}
              <Link
                href={`/decks/${encodeURIComponent(r.id)}`}
                className="text-sm underline underline-offset-4"
                title="View deck"
              >
                View
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
