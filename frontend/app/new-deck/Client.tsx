"use client";
import React from "react";
import { useRouter } from "next/navigation";
import FormatPickerModal from "@/components/FormatPickerModal";

type Format = "commander" | "standard" | "modern" | "pioneer" | "pauper";

export default function NewDeckClient() {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function createDeck(format: Format) {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Deck",
          format: format.charAt(0).toUpperCase() + format.slice(1),
          plan: "Optimized",
          colors: [],
          currency: "USD",
          deck_text: "",
          is_public: false,
        }),
      });

      const data = await response.json();

      if (data.ok && data.deck?.id) {
        // Redirect to the new deck
        router.push(`/my-decks/${data.deck.id}`);
      } else {
        throw new Error(data.error || "Failed to create deck");
      }
    } catch (err: any) {
      console.error("Error creating deck:", err);
      setError(err.message || "Failed to create deck");
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <FormatPickerModal
        isOpen={!creating}
        onSelect={createDeck}
        onClose={() => router.push("/my-decks")}
      />
      
      {creating && (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-neutral-400">Creating your deck...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300 max-w-md">
          <p className="font-semibold mb-1">Error</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => router.push("/my-decks")}
            className="mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
          >
            Back to My Decks
          </button>
        </div>
      )}
    </div>
  );
}

