"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardAutocomplete from "./CardAutocomplete";
import PlaystyleQuizModal from "./PlaystyleQuizModal";

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
  const [showQuiz, setShowQuiz] = useState(false);
  const [moduleDLoading, setModuleDLoading] = useState(false);
  const [moduleDError, setModuleDError] = useState<string | null>(null);
  const [moduleCLoading, setModuleCLoading] = useState(false);
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
        throw new Error(json?.error || "Generation failed");
      }
      router.push(json.url || `/my-decks/${json.deckId}`);
    } catch (e: unknown) {
      setModuleDError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setModuleDLoading(false);
    }
  };

  const handleModuleCScaffold = async () => {
    setModuleCLoading(true);
    try {
      const res = await fetch("/api/decks/scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      router.push(json.url || `/my-decks/${json.id}`);
    } catch (e: unknown) {
      setModuleDError(e instanceof Error ? e.message : "Scaffold failed");
    } finally {
      setModuleCLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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
            Browse legendary creatures by colors and archetype. Use the card search on My Decks to find commanders.
          </p>
          <Link
            href="/my-decks"
            className="block w-full py-3 px-4 text-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl"
          >
            Go to My Decks →
          </Link>
        </div>

        {/* Module C: Archetype Builder */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">C</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            Archetype Builder
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Start from an archetype to get a scaffold deck you can customize.
          </p>
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
          <button
            onClick={handleModuleCScaffold}
            disabled={moduleCLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl"
          >
            {moduleCLoading ? "Creating…" : "Create Scaffold Deck"}
          </button>
        </div>

        {/* Module D: AI Deck Generator */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-4">D</div>
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            AI Deck Generator
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Enter a commander and preferences; AI generates a full deck from the card pool.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Commander</label>
              <CardAutocomplete
                value={commander}
                onChange={setCommander}
                onPick={setCommander}
                placeholder="Search commander…"
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
            <button
              onClick={handleModuleDGenerate}
              disabled={moduleDLoading || !commander.trim()}
              className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl"
            >
              {moduleDLoading ? "Generating…" : "Generate Deck"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
