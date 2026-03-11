"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CardAutocomplete from "./CardAutocomplete";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/lib/auth-context";
import DeckGenerationResultsModal, { type DeckPreviewResult } from "./DeckGenerationResultsModal";
import {
  QUIZ_QUESTIONS,
  calculateProfile,
  computeTraits,
} from "@/lib/quiz/quiz-data";
import {
  getCommanderSuggestionsWithMatch,
  type CommanderSuggestion,
} from "@/lib/quiz/commander-suggestions";

type Tab = "guided" | "quick" | "quiz";

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

interface BuildDeckFromCollectionModalProps {
  collectionId: string;
  onClose: () => void;
}

export default function BuildDeckFromCollectionModal({
  collectionId,
  onClose,
}: BuildDeckFromCollectionModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isPro } = useProStatus();
  const [collectionItemNames, setCollectionItemNames] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("guided");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json?.ok && Array.isArray(json.items)) {
          setCollectionItemNames(json.items.map((i: { name: string }) => i.name));
        }
      } catch {
        // ignore
      }
    })();
  }, [collectionId]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeckPreviewResult | null>(null);

  // Guided mode
  const [commander, setCommander] = useState("");
  const [playstyle, setPlaystyle] = useState("Value Engine");
  const [powerLevel, setPowerLevel] = useState("Casual");
  const [budget, setBudget] = useState("Moderate");

  // Quiz mode
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizDone, setQuizDone] = useState(false);
  const [quizCommanders, setQuizCommanders] = useState<CommanderSuggestion[]>([]);
  const [quizProfile, setQuizProfile] = useState<string>("");
  const [selectedCommander, setSelectedCommander] = useState<string>("");

  const runGenerate = async (opts: {
    commander?: string;
    playstyle?: string;
    powerLevel?: string;
    budget?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deck/generate-from-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          commander: opts.commander || undefined,
          playstyle: opts.playstyle || undefined,
          powerLevel: opts.powerLevel || "Casual",
          budget: opts.budget || "Moderate",
          format: "Commander",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 429 && json?.code === "RATE_LIMIT_DAILY") {
          setError(
            json?.error || "Daily limit reached. " + (isPro ? "Contact support." : "Upgrade to Pro for more!")
          );
          return;
        }
        throw new Error(json?.error || "Generation failed");
      }
      if (json.preview && json.decklist && json.commander) {
        setPreview({
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
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGuidedGenerate = () => {
    if (!commander.trim()) {
      setError("Select a commander");
      return;
    }
    runGenerate({ commander: commander.trim(), playstyle, powerLevel, budget });
  };

  const handleQuickGenerate = () => {
    runGenerate({ powerLevel: "Casual", budget: "Moderate" });
  };

  const handleQuizAnswer = (answerId: string) => {
    const q = QUIZ_QUESTIONS[quizIndex];
    const newAnswers = { ...quizAnswers, [q.id]: answerId };
    setQuizAnswers(newAnswers);

    if (quizIndex === QUIZ_QUESTIONS.length - 1) {
      const profile = calculateProfile(newAnswers);
      const traits = computeTraits(newAnswers);
      const commanders = getCommanderSuggestionsWithMatch(profile, traits);
      setQuizCommanders(commanders);
      setQuizProfile(profile.label);
      setQuizDone(true);
    } else {
      setQuizIndex(quizIndex + 1);
    }
  };

  const handleQuizBuild = () => {
    const cmd = selectedCommander || quizCommanders[0]?.name;
    if (!cmd) {
      setError("Select a commander");
      return;
    }
    runGenerate({
      commander: cmd,
      playstyle: quizProfile,
      powerLevel: "Casual",
      budget: "Moderate",
    });
  };

  const inCollection = new Set(
    collectionItemNames.map((n) => n.toLowerCase().trim())
  );
  const commandersInCollection = quizCommanders.filter((c) =>
    inCollection.has(c.name.toLowerCase())
  );
  const commandersToShow =
    commandersInCollection.length > 0 ? commandersInCollection : quizCommanders;

  const handleCreateDeckFromPreview = async () => {
    if (!preview) return;
    setCreating(true);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: preview.title,
          format: preview.format,
          plan: preview.plan,
          colors: preview.colors,
          deck_text: preview.deckText,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create deck");
      onClose();
      router.push(`/my-decks/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create deck");
    } finally {
      setCreating(false);
    }
  };

  if (preview) {
    return createPortal(
      <DeckGenerationResultsModal
        preview={preview}
        onClose={() => {
          setPreview(null);
          onClose();
        }}
        onCreateDeck={handleCreateDeckFromPreview}
        isCreating={creating}
        requireAuth
        isGuest={!user}
      />,
      document.body
    );
  }

  const modal = (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-2xl">
          <p className="text-white font-medium mb-4">Analyzing your collection and generating deck…</p>
          <div className="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full w-1/2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
              style={{ animation: "progress-bar-slide 1.5s ease-in-out infinite" }}
            />
          </div>
        </div>
      )}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">
              Build a Deck From This Collection
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(["guided", "quick", "quiz"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setError(null);
                  if (t !== "quiz") {
                    setQuizDone(false);
                    setQuizIndex(0);
                    setQuizAnswers({});
                  }
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  tab === t
                    ? "bg-purple-600 text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                {t === "guided" && "Guided Builder"}
                {t === "quick" && "Build It For Me"}
                {t === "quiz" && "Find My Playstyle"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
              {error}
              {!isPro && error.toLowerCase().includes("limit") && (
                <a href="/pricing" className="block mt-2 text-amber-300 hover:text-amber-200 font-medium">
                  Upgrade to Pro →
                </a>
              )}
            </div>
          )}

          {tab === "guided" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Commander (from collection or search)
                </label>
                <CardAutocomplete
                  value={commander}
                  onChange={setCommander}
                  onPick={setCommander}
                  placeholder="Search for a commander…"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Playstyle
                </label>
                <select
                  value={playstyle}
                  onChange={(e) => setPlaystyle(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                >
                  {PLAYSTYLES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    Power Level
                  </label>
                  <select
                    value={powerLevel}
                    onChange={(e) => setPowerLevel(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                  >
                    {POWER_LEVELS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    Budget
                  </label>
                  <select
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                  >
                    {BUDGETS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleGuidedGenerate}
                disabled={loading || !commander.trim()}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg"
              >
                {loading ? "Generating…" : "Generate Deck"}
              </button>
            </div>
          )}

          {tab === "quick" && (
            <div className="space-y-4">
              <p className="text-neutral-300 text-sm">
                AI will pick a commander and build a deck from your collection
                automatically.
              </p>
              <button
                onClick={handleQuickGenerate}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg"
              >
                {loading ? "Generating…" : "Build It For Me"}
              </button>
            </div>
          )}

          {tab === "quiz" && !quizDone && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-400">
                Question {quizIndex + 1} of {QUIZ_QUESTIONS.length}
              </p>
              <h3 className="text-lg font-semibold text-white">
                {QUIZ_QUESTIONS[quizIndex].text}
              </h3>
              <div className="space-y-2">
                {QUIZ_QUESTIONS[quizIndex].answers.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleQuizAnswer(a.id)}
                    className="w-full text-left p-4 bg-neutral-900 border border-neutral-700 rounded-xl hover:border-purple-500 text-neutral-200"
                  >
                    {a.text}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setQuizIndex(Math.max(0, quizIndex - 1))}
                disabled={quizIndex === 0}
                className="text-sm text-neutral-400 hover:text-white disabled:opacity-50"
              >
                ← Back
              </button>
            </div>
          )}

          {tab === "quiz" && quizDone && (
            <div className="space-y-4">
              <p className="text-neutral-300">
                Your profile: <strong className="text-white">{quizProfile}</strong>
              </p>
              <p className="text-sm text-neutral-400">
                Pick a commander (prioritizing those in your collection):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {commandersToShow.slice(0, 8).map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedCommander(c.name)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selectedCommander === c.name
                        ? "border-purple-500 bg-purple-900/30"
                        : "border-neutral-700 hover:border-neutral-600 bg-neutral-900"
                    }`}
                  >
                    <span className="font-medium text-white">{c.name}</span>
                    {inCollection.has(c.name.toLowerCase()) && (
                      <span className="ml-2 text-xs text-emerald-400">In collection</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={handleQuizBuild}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg"
              >
                {loading ? "Generating…" : "Generate Deck"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
