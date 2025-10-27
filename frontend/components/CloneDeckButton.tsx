// components/CloneDeckButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CloneDeckButton({ 
  deckId, 
  className 
}: { 
  deckId: string; 
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newDeckId, setNewDeckId] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState<string>("");
  const router = useRouter();

  async function handleClone() {
    setLoading(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/clone`, {
        method: "POST",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        if (res.status === 401) {
          alert("Please sign in to clone this deck");
          window.location.href = "/my-decks";
          return;
        }
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      // Success!
      setNewDeckId(json.deckId);
      setDeckTitle(json.title || "Your cloned deck");
      setShowModal(true);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to clone deck: ${e.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  function handleNavigate() {
    if (newDeckId) {
      router.push(`/my-decks/${newDeckId}`);
    }
  }

  return (
    <>
      <button
        onClick={handleClone}
        disabled={loading}
        className={
          className ||
          "px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-indigo-500/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        }
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Cloning...</span>
          </>
        ) : (
          <>
            <span>🔄</span>
            <span>Clone this deck</span>
          </>
        )}
      </button>

      {/* Success Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 rounded-xl border border-neutral-700 shadow-2xl max-w-md w-full p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Deck Cloned!</h3>
                <p className="text-sm text-neutral-400">Successfully copied to your collection</p>
              </div>
            </div>
            
            <div className="bg-neutral-800/50 rounded-lg p-4 mb-4 border border-neutral-700/50">
              <p className="text-sm text-neutral-300 mb-1">
                <span className="font-semibold text-white">New deck:</span>
              </p>
              <p className="text-base text-white font-medium">{deckTitle}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleNavigate}
                className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium transition-all shadow-md hover:shadow-lg"
              >
                Open My Deck →
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-3 rounded-lg border border-neutral-600 hover:bg-neutral-800 text-neutral-300 hover:text-white font-medium transition-colors"
              >
                Stay Here
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

