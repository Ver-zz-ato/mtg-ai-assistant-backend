"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardAutocomplete from "./CardAutocomplete";
import PlaystyleQuizModal from "./PlaystyleQuizModal";
import DeckGenerationResultsModal, { type DeckPreviewResult } from "./DeckGenerationResultsModal";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

const POWER_LEVELS = ["Casual", "Mid", "Focused", "Optimized", "Competitive"];
const BUDGETS = ["Budget", "Moderate", "High"];
const PLAYSTYLES = [
  "Value Engine",
  "Calculated Control",
  "Chaos Gremlin",
  "Table Politician",
  "Combo Master",
  "Tactical Mind",
];

const ARCHETYPES = [
  { name: "Tokens", colors: ["W", "G"], desc: "Overwhelm with creature tokens" },
  { name: "Aristocrats", colors: ["W", "B"], desc: "Sacrifice for value" },
  { name: "Lands", colors: ["G", "U"], desc: "Landfall and land recursion" },
  { name: "Spellslinger", colors: ["U", "R"], desc: "Cast spells for payoffs" },
  { name: "Graveyard", colors: ["B", "G"], desc: "Recur from graveyard" },
  { name: "Artifacts", colors: ["U", "R", "W"], desc: "Artifact synergies" },
  { name: "Tribal", colors: ["W", "B", "R"], desc: "Creature type tribal" },
  { name: "Superfriends", colors: ["W", "U", "B", "G"], desc: "Planeswalker focus" },
];

export default function CommanderBuilderModules() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPro } = useProStatus();
  const [showQuiz, setShowQuiz] = useState(false);
  const [moduleDLoading, setModuleDLoading] = useState(false);
  const [moduleDError, setModuleDError] = useState<string | null>(null);
  const [moduleDPreview, setModuleDPreview] = useState<DeckPreviewResult | null>(null);
  const [moduleDCreating, setModuleDCreating] = useState(false);
  const [moduleCLoading, setModuleCLoading] = useState(false);
  const [moduleCError, setModuleCError] = useState<string | null>(null);
  const [moduleCPreview, setModuleCPreview] = useState<DeckPreviewResult | null>(null);
  const [moduleCCreating, setModuleCCreating] = useState(false);
  const [commander, setCommander] = useState("");
  const [playstyle, setPlaystyle] = useState("Value Engine");
  const [powerLevel, setPowerLevel] = useState("Casual");
  const [budget, setBudget] = useState("Moderate");
  const [archetype, setArchetype] = useState(ARCHETYPES[0]);

  const handleModuleDGenerate = async () => {
    if (!commander.trim()) {
      setModuleDError("Select a commander");
      return;
    }
    setModuleDLoading(true);
    setModuleDError(null);
    try {
      const res = await fetch("/api/deck/generate-from-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commander: commander.trim(),
          playstyle,
          powerLevel,
          budget,
          format: "Commander",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 429 && json?.code === "RATE_LIMIT_DAILY") {
          setModuleDError(
            json?.error || (isPro ? "Daily limit reached." : "Daily limit reached. Upgrade to Pro for more!")
          );
          return;
        }
        throw new Error(json?.error || "Generation failed");
      }
      if (json.preview && json.decklist && json.commander) {
        setModuleDPreview({
          decklist: json.decklist,
          commander: json.commander,
          colors: json.colors || [],
          overallAim: json.overallAim || `A Commander deck led by ${json.commander}.`,
          title: json.title || `${json.commander} (AI)`,
          deckText: json.deckText || "",
          format: json.format || "Commander",
          plan: json.plan || "Optimized",
        });
      } else {
        router.push(json.url || `/my-decks/${json.deckId}`);
      }
    } catch (e: unknown) {
      setModuleDError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setModuleDLoading(false);
    }
  };

  const handleModuleDCreateDeck = async () => {
    if (!moduleDPreview) return;
    setModuleDCreating(true);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: moduleDPreview.title,
          format: moduleDPreview.format,
          plan: moduleDPreview.plan,
          colors: moduleDPreview.colors,
          deck_text: moduleDPreview.deckText,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create deck");
      setModuleDPreview(null);
      router.push(`/my-decks/${json.id}`);
    } catch (e) {
      setModuleDError(e instanceof Error ? e.message : "Failed to create deck");
    } finally {
      setModuleDCreating(false);
    }
  };

  const handleModuleCScaffold = async () => {
    setModuleCLoading(true);
    setModuleCError(null);
    try {
      const res = await fetch("/api/decks/scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview: true,
          intent: {
            format: "Commander",
            colors: archetype.colors,
            archetype: archetype.name,
            title: `${archetype.name} (Scaffold)`,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Scaffold failed");
      }
      if (json.preview && json.decklist && json.title) {
        setModuleCPreview({
          decklist: json.decklist,
          commander: json.commander || json.title,
          colors: json.colors || archetype.colors,
          overallAim: json.overallAim || `${archetype.name} scaffold deck`,
          title: json.title,
          deckText: json.deckText || "",
          format: json.format || "Commander",
          plan: json.plan || "optimized",
        });
      } else {
        router.push(json.url || `/my-decks/${json.id}`);
      }
    } catch (e: unknown) {
      setModuleCError(e instanceof Error ? e.message : "Scaffold failed");
    } finally {
      setModuleCLoading(false);
    }
  };

  const handleModuleCCreateDeck = async () => {
    if (!moduleCPreview) return;
    setModuleCCreating(true);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: moduleCPreview.title,
          format: moduleCPreview.format,
          plan: moduleCPreview.plan,
          colors: moduleCPreview.colors,
          deck_text: moduleCPreview.deckText,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create deck");
      setModuleCPreview(null);
      router.push(`/my-decks/${json.id}`);
    } catch (e: unknown) {
      setModuleCError(e instanceof Error ? e.message : "Failed to create deck");
    } finally {
      setModuleCCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative">
      {(moduleDLoading || moduleCLoading) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 rounded-2xl"
          aria-busy="true"
        >
          <p className="text-white font-medium mb-4">{moduleCLoading ? "Building scaffold deck…" : "Analyzing and generating deck…"}</p>
          <div className="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full w-1/2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
              style={{ animation: "progress-bar-slide 1.5s ease-in-out infinite" }}
            />
          </div>
        </div>
      )}
      <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
        Build Your Commander Deck
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
        Choose your path: find your playstyle, browse commanders, start from an archetype, or let AI generate a deck.
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Module A: Find My Playstyle */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">A</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            Find My Playstyle
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Take a short quiz to discover your MTG playstyle and get personalized commander suggestions.
          </p>
          <button
            onClick={() => setShowQuiz(true)}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl"
          >
            Start Quiz
          </button>
          {showQuiz && <PlaystyleQuizModal onClose={() => setShowQuiz(false)} />}
        </div>

        {/* Module B: Commander Finder */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">B</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            Commander Finder
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Browse legendary creatures by colors and archetype. {!user && "Sign in to use My Decks."}
          </p>
          <Link
            href={user ? "/my-decks" : "/login"}
            className="block w-full py-3 px-4 text-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl"
          >
            {user ? "Go to My Decks →" : "Sign in to Browse →"}
          </Link>
        </div>

        {/* Module C: Archetype Builder - auth required */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">C</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            Archetype Builder
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Start from an archetype to get a scaffold deck you can customize.
          </p>
          {!user ? (
            <Link
              href="/login"
              className="block w-full py-3 px-4 text-center bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl"
            >
              Sign in to Create Scaffold
            </Link>
          ) : (
            <>
              <select
                value={archetype.name}
                onChange={(e) => {
                  const a = ARCHETYPES.find((x) => x.name === e.target.value) || ARCHETYPES[0];
                  setArchetype(a);
                }}
                className="w-full mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
              >
                {ARCHETYPES.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} – {a.desc}
                  </option>
                ))}
              </select>
              {moduleCError && (
                <p className="text-sm text-red-500 mb-2">{moduleCError}</p>
              )}
              <button
                onClick={handleModuleCScaffold}
                disabled={moduleCLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl"
              >
                {moduleCLoading ? "Building…" : "Create Scaffold Deck"}
              </button>
            </>
          )}
        </div>

        {/* Module D: AI Deck Generator - auth required, rate limited */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">D</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            AI Deck Generator
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Enter a commander and preferences; AI generates a full deck from the card pool. {!user && "Sign in to use."}
          </p>
          {!user ? (
            <Link
              href="/login"
              className="block w-full py-3 px-4 text-center bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-xl"
            >
              Sign in to Generate Deck
            </Link>
          ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Commander</label>
              <CardAutocomplete
                value={commander}
                onChange={setCommander}
                onPick={setCommander}
                placeholder="Search commander…"
                searchUrl="/api/cards/search-commanders"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Playstyle</label>
              <select
                value={playstyle}
                onChange={(e) => setPlaystyle(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm mb-2"
              >
                {PLAYSTYLES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Power</label>
                <select
                  value={powerLevel}
                  onChange={(e) => setPowerLevel(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm"
                >
                  {POWER_LEVELS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Budget</label>
                <select
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm"
                >
                  {BUDGETS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            {moduleDError && (
              <p className="text-sm text-red-500">{moduleDError}</p>
            )}
            {moduleDError && !isPro && moduleDError.toLowerCase().includes("limit") && (
              <a href="/pricing" className="block text-sm text-amber-500 hover:text-amber-400">
                Upgrade to Pro for more generations →
              </a>
            )}
            <button
              onClick={handleModuleDGenerate}
              disabled={moduleDLoading || !commander.trim()}
              className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              {moduleDLoading ? "Generating…" : "Generate Deck"}
            </button>
          </div>
          )}
        </div>
      </div>

      {moduleDPreview && (
        <DeckGenerationResultsModal
          preview={moduleDPreview}
          onClose={() => setModuleDPreview(null)}
          onCreateDeck={handleModuleDCreateDeck}
          isCreating={moduleDCreating}
          requireAuth
          isGuest={!user}
        />
      )}
      {moduleCPreview && (
        <DeckGenerationResultsModal
          preview={moduleCPreview}
          onClose={() => { setModuleCPreview(null); setModuleCError(null); }}
          onCreateDeck={handleModuleCCreateDeck}
          isCreating={moduleCCreating}
          requireAuth
          isGuest={!user}
        />
      )}
    </div>
  );
}
