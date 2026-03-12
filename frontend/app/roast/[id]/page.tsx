import React from "react";
import { notFound } from "next/navigation";
import { createClientForStatic } from "@/lib/server-supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RoastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClientForStatic();
  const { data: row, error } = await supabase
    .from("roast_permalinks")
    .select("roast_text, roast_score, commander, format, roast_level, commander_art_url, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const levelLabels: Record<string, { emoji: string; label: string }> = {
    gentle: { emoji: "🟢", label: "Gentle" },
    balanced: { emoji: "🟡", label: "Balanced" },
    spicy: { emoji: "🌶", label: "Spicy" },
    savage: { emoji: "🔥", label: "Savage" },
  };
  const level = levelLabels[(row.roast_level || "").toLowerCase()] || levelLabels.balanced;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-amber-400 hover:text-amber-300 text-sm font-medium"
          >
            ← ManaTap AI
          </Link>
        </div>

        <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6 space-y-6">
          <h1 className="text-center text-xl font-bold text-amber-200">
            Roast my Deck 🔥
          </h1>

          <div className="text-center">
            <span className="inline-block px-4 py-2 rounded-full bg-amber-900/50 border border-amber-700/60 text-amber-200 font-bold">
              {level.emoji} {level.label} Roast Activated
            </span>
          </div>

          {row.commander_art_url && (
            <div className="flex justify-center">
              <img
                src={row.commander_art_url}
                alt={row.commander || "Commander"}
                className="w-48 h-auto rounded-lg border border-neutral-700 shadow-lg"
              />
            </div>
          )}

          <div className="text-sm text-neutral-200 whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
            {row.roast_text.split(/(\[\[[^\]]+\]\])/g).map((part: string, i: number) => {
              const m = part.match(/^\[\[([^\]]+)\]\]$/);
              if (m) {
                return (
                  <span key={i} className="border-b border-dotted border-neutral-500" title={m[1]}>
                    {m[1]}
                  </span>
                );
              }
              return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
          </div>

          <div className="pt-4 border-t border-neutral-700 text-center">
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
            >
              Get your deck roasted
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
