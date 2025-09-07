import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import React from "react";

export const dynamic = "force-dynamic";

type DeckRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  name?: string | null; // legacy support
  format?: string | null;
  commander?: string | null;
  is_public?: boolean | null;
  deck_text?: string | null;
  data?: any | null; // { cards?: [{name, qty}], text?: string }
  meta?: any | null; // { deck_text?: string }
  created_at?: string | null;
};

function resolveTitle(row: DeckRow): string {
  return (row.title ?? row.name ?? "Untitled deck").trim();
}
function resolveText(row: DeckRow): string {
  return (
    row.deck_text ??
    row.meta?.deck_text ??
    row.data?.text ??
    ""
  );
}
function resolveCommander(row: DeckRow): string | null {
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

function CopyButtons({ deckText, shareUrl }: { deckText: string; shareUrl: string }) {
  "use client";
  const [msg, setMsg] = React.useState<string>("");

  async function copyDeck() {
    try {
      await navigator.clipboard.writeText(deckText);
      setMsg("Copied decklist");
      setTimeout(() => setMsg(""), 1200);
    } catch {
      setMsg("Copy failed");
      setTimeout(() => setMsg(""), 1500);
    }
  }
  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMsg("Share link copied");
      setTimeout(() => setMsg(""), 1200);
    } catch {
      setMsg("Copy failed");
      setTimeout(() => setMsg(""), 1500);
    }
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={copyDeck}
        className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm"
        title="Copy decklist to clipboard"
      >
        Copy decklist
      </button>
      <button
        onClick={copyShare}
        className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm"
        title="Copy public share link"
      >
        Share link
      </button>
      {msg && <span className="text-xs opacity-75">{msg}</span>}
    </div>
  );
}

export default async function DeckDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const authedId = auth?.user?.id ?? null;

  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Deck not found</h1>
        <div className="text-sm opacity-75">{error?.message || "This deck may be private or deleted."}</div>
        <div className="mt-4">
          <Link href="/my-decks" className="underline underline-offset-4">My Decks</Link>
        </div>
      </div>
    );
  }

  const row = data as DeckRow;
  const title = resolveTitle(row);
  const text = resolveText(row);
  const commander = resolveCommander(row);
  const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";
  const isOwner = authedId && row.user_id && authedId === row.user_id;
  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/decks/${encodeURIComponent(row.id)}`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{title}</h1>
          <div className="text-xs opacity-75">
            {(row.format ?? "Commander")}{commander ? ` • ${commander}` : ""}{created ? ` • ${created}` : ""}
            {row.is_public ? " • Public" : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/collections/cost-to-finish?deck=${encodeURIComponent(row.id)}`}
            className="text-sm underline underline-offset-4"
            title="Open Cost to Finish for this deck"
          >
            Cost to Finish →
          </Link>
        </div>
      </div>

      <CopyButtons deckText={text} shareUrl={shareUrl} />

      <div className="grid gap-2">
        <div className="text-sm opacity-75">Decklist</div>
        <textarea
          className="w-full h-72 border rounded p-2 font-mono"
          readOnly
          value={text}
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Link href="/my-decks" className="text-sm underline underline-offset-4">← Back to My Decks</Link>
        {isOwner ? (
          <span className="text-xs opacity-70">You are the owner.</span>
        ) : (
          <span className="text-xs opacity-70">Read-only view.</span>
        )}
      </div>
    </div>
  );
}
