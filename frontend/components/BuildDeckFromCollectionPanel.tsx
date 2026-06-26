"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BuildDeckFromCollectionModal, {
  type BuildDeckFromCollectionTab,
} from "./BuildDeckFromCollectionModal";
import BuildDeckFromCollectionChooser from "./BuildDeckFromCollectionChooser";

interface BuildDeckFromCollectionPanelProps {
  collectionId: string;
}

function parseBuildTab(raw: string | null): BuildDeckFromCollectionTab | undefined {
  if (raw === "guided" || raw === "quiz" || raw === "quick") return raw;
  return undefined;
}

export default function BuildDeckFromCollectionPanel({ collectionId }: BuildDeckFromCollectionPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showChooser, setShowChooser] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [initialTab, setInitialTab] = useState<BuildDeckFromCollectionTab>("guided");

  useEffect(() => {
    if (searchParams.get("buildDeck") !== "1") return;
    const mode = searchParams.get("buildMode");
    if (mode === "manual") {
      router.replace(`/collections/${collectionId}/build/manual`);
      return;
    }
    if (mode === "ai" || searchParams.get("buildTab")) {
      setInitialTab(parseBuildTab(searchParams.get("buildTab")) ?? "guided");
      setShowAiModal(true);
      return;
    }
    setShowChooser(true);
  }, [searchParams, collectionId, router]);

  return (
    <>
      <div className="rounded-xl border border-purple-500/50 bg-gradient-to-br from-purple-950/80 via-indigo-950/60 to-neutral-950 p-4 shadow-xl shadow-purple-500/10">
        <div className="flex flex-col h-full">
          <h3 className="text-lg font-bold text-white mb-3">Build a Deck From This Collection</h3>
          <p className="text-sm text-neutral-200 leading-relaxed mb-3">
            Build manually from cards you own, or let AI suggest a full list.
          </p>
          <ul className="space-y-2 text-xs text-neutral-300 mb-4">
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span> <strong>Build it myself</strong> — Pick format and add cards from your collection
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span> <strong>Guided AI</strong> — Commander, playstyle quiz, or auto-build
            </li>
          </ul>
          <button
            type="button"
            onClick={() => setShowChooser(true)}
            className="w-full rounded-lg border border-purple-500/30 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 hover:shadow-purple-500/25"
          >
            Build a Deck From This Collection →
          </button>
        </div>
      </div>

      {showChooser ? (
        <BuildDeckFromCollectionChooser
          onClose={() => setShowChooser(false)}
          onSelect={(mode) => {
            setShowChooser(false);
            if (mode === "manual") {
              router.push(`/collections/${collectionId}/build/manual`);
            } else {
              setInitialTab("guided");
              setShowAiModal(true);
            }
          }}
        />
      ) : null}

      {showAiModal ? (
        <BuildDeckFromCollectionModal
          collectionId={collectionId}
          initialTab={initialTab}
          onClose={() => setShowAiModal(false)}
        />
      ) : null}
    </>
  );
}
