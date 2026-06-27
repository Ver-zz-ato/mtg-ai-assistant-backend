"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CardAutocomplete from "./CardAutocomplete";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/lib/auth-context";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import DeckGenerationResultsModal, { type DeckPreviewResult } from "./DeckGenerationResultsModal";
import ConstructedDeckResultModal from "./ConstructedDeckResultModal";
import {
  QUIZ_QUESTIONS,
  calculateProfile,
  computeTraits,
} from "@/lib/quiz/quiz-data";
import {
  getCommanderSuggestionsWithMatch,
  type CommanderSuggestion,
} from "@/lib/quiz/commander-suggestions";
import {
  buildGenerateFromCollectionBody,
  clearCollectionBuildQuizHandoff,
  loadCollectionBuildQuizHandoff,
  quizBudgetToApiBudget,
  quizTraitsToApiPower,
  type CollectionOwnershipMode,
} from "@/lib/build/collectionPlaystylePayload";
import {
  COLLECTION_FORMAT_OPTIONS,
  CONSTRUCTED_COLOR_OPTIONS,
  CONSTRUCTED_DIRECTION_OPTIONS,
  CONSTRUCTED_OUTPUT_OPTIONS,
  buildConstructedNotes,
  deriveConstructedArchetypeFromQuizAnswers,
  deriveConstructedBudgetFromQuizAnswers,
  deriveConstructedDirectionFromQuizAnswers,
  deriveConstructedPowerFromQuizAnswers,
  deriveConstructedProfileLabel,
  getConstructedQuizQuestions,
  ideaSlugToConstructedFormat,
  isConstructedFormat,
  skeletonSlugToConstructedFormat,
  toConstructedBudget,
  toConstructedPower,
  type CollectionBuildFormat,
  type CollectionDeckIdea,
  type CollectionDeckSkeleton,
  type CollectionConstructedMeta,
  type ConstructedDeckResult,
  type ConstructedDirection,
  type ConstructedFormat,
  type ConstructedOutputMode,
} from "@/lib/build/collectionConstructedPayload";

export type BuildDeckFromCollectionTab = "guided" | "quick" | "quiz";
type Tab = BuildDeckFromCollectionTab;

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
  /** Open on a specific tab (e.g. from ?buildTab=quiz). */
  initialTab?: Tab;
}

export default function BuildDeckFromCollectionModal({
  collectionId,
  onClose,
  initialTab = "guided",
}: BuildDeckFromCollectionModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isPro } = useProStatus();
  const { preview: hoverPreview, bind } = useHoverPreview();
  const [collectionItemNames, setCollectionItemNames] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [format, setFormat] = useState<CollectionBuildFormat>("Commander");
  const [ownershipMode, setOwnershipMode] =
    useState<CollectionOwnershipMode>("mostly_collection");

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
  const activeControllerRef = useRef<AbortController | null>(null);

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
  const [commanderImages, setCommanderImages] = useState<Record<string, { small?: string; normal?: string }>>({});

  // Constructed mode
  const [constructedDirection, setConstructedDirection] =
    useState<ConstructedDirection>("competitive");
  const [constructedOutputMode, setConstructedOutputMode] =
    useState<ConstructedOutputMode>("ideas");
  const [constructedColors, setConstructedColors] = useState<string[]>([]);
  const [constructedArchetype, setConstructedArchetype] = useState("");
  const [constructedInclude, setConstructedInclude] = useState("");
  const [constructedAvoid, setConstructedAvoid] = useState("");
  const [constructedNotes, setConstructedNotes] = useState("");
  const [constructedQuizOpen, setConstructedQuizOpen] = useState(false);
  const [constructedQuizIndex, setConstructedQuizIndex] = useState(0);
  const [constructedQuizAnswers, setConstructedQuizAnswers] = useState<Record<string, string>>({});
  const [constructedQuizProfile, setConstructedQuizProfile] = useState<string | null>(null);
  const [constructedIdeas, setConstructedIdeas] = useState<CollectionDeckIdea[] | null>(null);
  const [constructedIdeasMeta, setConstructedIdeasMeta] = useState<CollectionConstructedMeta | null>(null);
  const [constructedSkeleton, setConstructedSkeleton] = useState<CollectionDeckSkeleton | null>(null);
  const [constructedSkeletonMeta, setConstructedSkeletonMeta] = useState<CollectionConstructedMeta | null>(null);
  const [constructedDeckResult, setConstructedDeckResult] = useState<ConstructedDeckResult | null>(null);
  const [constructedResultSource, setConstructedResultSource] =
    useState<"direct" | "idea" | "skeleton" | null>(null);
  const [constructedSeedIdea, setConstructedSeedIdea] = useState<CollectionDeckIdea | null>(null);
  const [constructedSeedSkeleton, setConstructedSeedSkeleton] = useState<CollectionDeckSkeleton | null>(null);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  const beginGeneration = () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setLoading(true);
    setError(null);
    return controller;
  };

  const finishGeneration = (controller: AbortController) => {
    if (activeControllerRef.current === controller) {
      activeControllerRef.current = null;
      setLoading(false);
    }
  };

  const cancelGeneration = () => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setLoading(false);
    setError("Generation cancelled.");
  };

  useEffect(() => {
    const handoff = loadCollectionBuildQuizHandoff();
    if (!handoff) return;
    setTab("quiz");
    setQuizAnswers(handoff.answers);
    setQuizProfile(handoff.profileLabel);
    setQuizDone(true);
    const profile = calculateProfile(handoff.answers);
    const traits = computeTraits(handoff.answers);
    const commanders = getCommanderSuggestionsWithMatch(profile, traits);
    setQuizCommanders(commanders);
    setPowerLevel(quizTraitsToApiPower(traits));
    setBudget(quizBudgetToApiBudget(handoff.answers.budget));
    if (handoff.selectedCommander) {
      setSelectedCommander(handoff.selectedCommander);
      setCommander(handoff.selectedCommander);
    }
    clearCollectionBuildQuizHandoff();
  }, []);

  const runGenerate = async (opts: {
    commander?: string;
    playstyle?: string;
    powerLevel?: string;
    budget?: string;
    fromQuiz?: boolean;
    profileLabel?: string;
    quizAnswers?: Record<string, string>;
    playstyleVibe?: string;
  }) => {
    const controller = beginGeneration();
    try {
      const body =
        opts.fromQuiz && opts.profileLabel
          ? buildGenerateFromCollectionBody({
              collectionId,
              commander: opts.commander,
              profileLabel: opts.profileLabel,
              quizAnswers: opts.quizAnswers,
              powerLevel: opts.powerLevel,
              budget: opts.budget,
              fromQuiz: true,
              collectionOwnershipMode: ownershipMode,
              playstyleVibe: opts.playstyleVibe,
            })
          : {
              ...buildGenerateFromCollectionBody({
                collectionId,
                commander: opts.commander,
                profileLabel: opts.playstyleVibe || opts.playstyle || "Value Engine",
                powerLevel: opts.powerLevel,
                budget: opts.budget,
                fromQuiz: false,
                collectionOwnershipMode: ownershipMode,
                playstyleVibe: opts.playstyleVibe || opts.playstyle,
              }),
              playstyle: opts.playstyle || undefined,
            };

      const res = await fetch("/api/deck/generate-from-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
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
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      finishGeneration(controller);
    }
  };

  const handleGuidedGenerate = () => {
    if (!commander.trim()) {
      setError("Select a commander");
      return;
    }
    runGenerate({
      commander: commander.trim(),
      playstyle,
      powerLevel,
      budget,
      playstyleVibe: playstyle,
      profileLabel: playstyle,
    });
  };

  const handleQuickGenerate = () => {
    runGenerate({ powerLevel: "Casual", budget: "Moderate" });
  };

  const clearConstructedOutputs = () => {
    setConstructedIdeas(null);
    setConstructedIdeasMeta(null);
    setConstructedSkeleton(null);
    setConstructedSkeletonMeta(null);
    setConstructedDeckResult(null);
    setConstructedSeedIdea(null);
    setConstructedSeedSkeleton(null);
    setConstructedResultSource(null);
  };

  const constructedPreferenceNotes = () =>
    buildConstructedNotes({
      buildMode: ownershipMode,
      direction: constructedDirection,
      quizProfile: constructedQuizProfile,
      quizAnswers: constructedQuizAnswers,
      include: constructedInclude,
      avoid: constructedAvoid,
      notes: constructedNotes,
    });

  const assertCanRunConstructed = (): ConstructedFormat | null => {
    if (!user) {
      setError("Sign in to generate from your collection.");
      return null;
    }
    if (!isConstructedFormat(format)) {
      setError("Choose a constructed format first.");
      return null;
    }
    return format;
  };

  const runConstructedIdeas = async () => {
    const constructedFormat = assertCanRunConstructed();
    if (!constructedFormat) return;
    const controller = beginGeneration();
    setConstructedSkeleton(null);
    setConstructedSkeletonMeta(null);
    setConstructedDeckResult(null);
    setConstructedResultSource(null);
    try {
      const res = await fetch("/api/deck/collection-constructed-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          collectionId,
          format: constructedFormat,
          buildMode: ownershipMode,
          direction: constructedDirection,
          outputMode: "ideas",
          preferences: {
            colors: constructedColors,
            archetype: constructedArchetype,
            include: constructedInclude,
            avoid: constructedAvoid,
            notes: constructedPreferenceNotes(),
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !Array.isArray(json.ideas)) {
        throw new Error(String(json?.error || "Could not generate deck ideas."));
      }
      setConstructedIdeas(json.ideas);
      setConstructedIdeasMeta(json.meta || null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not generate deck ideas.");
    } finally {
      finishGeneration(controller);
    }
  };

  const runConstructedSkeleton = async () => {
    const constructedFormat = assertCanRunConstructed();
    if (!constructedFormat) return;
    const controller = beginGeneration();
    setConstructedIdeas(null);
    setConstructedIdeasMeta(null);
    setConstructedDeckResult(null);
    setConstructedResultSource(null);
    try {
      const res = await fetch("/api/deck/collection-constructed-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          collectionId,
          format: constructedFormat,
          buildMode: ownershipMode,
          direction: constructedDirection,
          outputMode: "skeleton",
          preferences: {
            colors: constructedColors,
            archetype: constructedArchetype,
            include: constructedInclude,
            avoid: constructedAvoid,
            notes: constructedPreferenceNotes(),
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json.skeleton) {
        throw new Error(String(json?.error || "Could not build a deck skeleton."));
      }
      setConstructedSkeleton(json.skeleton);
      setConstructedSkeletonMeta(json.meta || null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not build a deck skeleton.");
    } finally {
      finishGeneration(controller);
    }
  };

  const runConstructedFullDeck = async (opts?: {
    idea?: CollectionDeckIdea;
    skeleton?: CollectionDeckSkeleton;
    source?: "direct" | "idea" | "skeleton";
  }) => {
    const fallbackFormat = assertCanRunConstructed();
    if (!fallbackFormat) return;
    const seedIdea = opts?.idea;
    const seedSkeleton = opts?.skeleton;
    const generatedFormat = seedIdea
      ? ideaSlugToConstructedFormat(seedIdea.format)
      : seedSkeleton
        ? skeletonSlugToConstructedFormat(seedSkeleton.format)
        : fallbackFormat;
    const seedCoreCards = seedIdea
      ? seedIdea.ownedCoreCards
      : seedSkeleton
        ? seedSkeleton.coreCards.map((card) => card.name)
        : [];
    const seedTitle = seedIdea?.title || seedSkeleton?.title;
    const seedArchetype = seedIdea?.archetype || seedSkeleton?.archetype || constructedArchetype;
    const seedColors = seedIdea?.colors || seedSkeleton?.colors || constructedColors;
    const source = opts?.source || (seedIdea ? "idea" : seedSkeleton ? "skeleton" : "direct");

    const controller = beginGeneration();
    setConstructedResultSource(source);
    setConstructedSeedIdea(seedIdea || null);
    setConstructedSeedSkeleton(seedSkeleton || null);
    try {
      const notes = [
        constructedPreferenceNotes(),
        seedIdea?.reason ? `Idea summary: ${seedIdea.reason}` : null,
        seedSkeleton?.gamePlan?.length ? `Game plan: ${seedSkeleton.gamePlan.join(" ")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      const res = await fetch("/api/deck/generate-constructed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          format: generatedFormat,
          collectionId,
          archetype: seedArchetype || undefined,
          colors: seedColors?.length ? seedColors : undefined,
          budget: toConstructedBudget(budget),
          powerLevel: toConstructedPower(powerLevel),
          notes: notes || undefined,
          seedFromIdea: seedTitle
            ? {
                title: seedTitle,
                archetype: seedArchetype || undefined,
                colors: seedColors?.length ? seedColors : undefined,
                coreCards: seedCoreCards.length ? seedCoreCards.slice(0, 80) : undefined,
              }
            : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Could not build the full deck."));
      }
      setConstructedDeckResult(json as ConstructedDeckResult);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not build the full deck.");
    } finally {
      finishGeneration(controller);
    }
  };

  const handleConstructedGenerate = () => {
    if (constructedOutputMode === "ideas") {
      void runConstructedIdeas();
    } else if (constructedOutputMode === "skeleton") {
      void runConstructedSkeleton();
    } else {
      void runConstructedFullDeck({ source: "direct" });
    }
  };

  const handleConstructedQuizAnswer = (answerId: string) => {
    if (!isConstructedFormat(format)) return;
    const questions = getConstructedQuizQuestions(format);
    const q = questions[constructedQuizIndex];
    if (!q) return;
    const nextAnswers = { ...constructedQuizAnswers, [q.id]: answerId };
    setConstructedQuizAnswers(nextAnswers);

    if (constructedQuizIndex >= questions.length - 1) {
      const profile = deriveConstructedProfileLabel(nextAnswers);
      setConstructedQuizProfile(profile);
      setConstructedDirection(deriveConstructedDirectionFromQuizAnswers(nextAnswers));
      setPowerLevel(deriveConstructedPowerFromQuizAnswers(nextAnswers));
      setBudget(deriveConstructedBudgetFromQuizAnswers(nextAnswers));
      setConstructedArchetype((current) =>
        current.trim() ? current : deriveConstructedArchetypeFromQuizAnswers(format, nextAnswers),
      );
      setConstructedQuizOpen(false);
      setConstructedQuizIndex(0);
      setError(null);
    } else {
      setConstructedQuizIndex((index) => index + 1);
    }
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
      setPowerLevel(quizTraitsToApiPower(traits));
      setBudget(quizBudgetToApiBudget(newAnswers.budget));
      setQuizDone(true);
    } else {
      setQuizIndex(quizIndex + 1);
    }
  };

  const handleQuizBuild = () => {
    const cmd = activeQuizCommander;
    if (!cmd) {
      setError("Select a commander");
      return;
    }
    runGenerate({
      commander: cmd,
      fromQuiz: true,
      profileLabel: quizProfile,
      quizAnswers,
      powerLevel,
      budget,
      playstyleVibe: quizProfile,
    });
  };

  const inCollection = new Set(
    collectionItemNames.map((n) => n.toLowerCase().trim())
  );
  const commandersInCollection = quizCommanders.filter((c) =>
    inCollection.has(c.name.toLowerCase().trim())
  );
  const commandersToShow =
    commandersInCollection.length > 0 ? commandersInCollection : quizCommanders;
  const activeQuizCommander = selectedCommander || commandersToShow[0]?.name || "";
  const commanderImageNames = quizDone
    ? commandersToShow
        .slice(0, 8)
        .map((c) => c.name)
        .join("|")
    : "";
  const constructedQuizQuestions = isConstructedFormat(format)
    ? getConstructedQuizQuestions(format)
    : [];
  const activeConstructedQuizQuestion = constructedQuizQuestions[constructedQuizIndex];

  useEffect(() => {
    if (!commanderImageNames) return;
    const names = commanderImageNames.split("|").filter(Boolean);
    const missing = names.filter((name) => !commanderImages[name]);
    if (missing.length === 0) return;

    let cancelled = false;
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: missing }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const next: Record<string, { small?: string; normal?: string }> = {};
        (j?.data || []).forEach((card: { name: string; image_uris?: { small?: string; normal?: string } }) => {
          if (card?.name && card?.image_uris) {
            next[card.name] = {
              small: card.image_uris.small,
              normal: card.image_uris.normal,
            };
          }
        });
        if (Object.keys(next).length > 0) {
          setCommanderImages((prev) => ({ ...prev, ...next }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [commanderImageNames, commanderImages]);

  const handleQuizGuided = () => {
    const cmd = activeQuizCommander;
    if (!cmd) {
      setError("Select a commander");
      return;
    }
    setSelectedCommander(cmd);
    setCommander(cmd);
    if (PLAYSTYLES.includes(quizProfile)) setPlaystyle(quizProfile);
    setTab("guided");
    setError(null);
  };

  const handleCreateDeckFromPreview = async (nextPreview?: DeckPreviewResult) => {
    const deckToCreate = nextPreview ?? preview;
    if (!deckToCreate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deckToCreate.title,
          format: deckToCreate.format,
          plan: deckToCreate.plan,
          colors: deckToCreate.colors,
          deck_text: deckToCreate.deckText,
          is_public: false,
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

  const handleCreateConstructedDeck = async (deckText: string) => {
    if (!constructedDeckResult) return;
    setCreating(true);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: constructedDeckResult.title,
          format: constructedDeckResult.format,
          plan: `AI ${constructedDeckResult.archetype || "Constructed"}`,
          colors: constructedDeckResult.colors || [],
          deck_text: deckText,
          is_public: false,
          creation_source: "ai_generated",
          generation_intent: "collection_constructed",
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

  if (constructedDeckResult) {
    return (
      <ConstructedDeckResultModal
        result={constructedDeckResult}
        onClose={() => {
          setConstructedDeckResult(null);
          onClose();
        }}
        onBack={() => {
          setConstructedDeckResult(null);
          setError(null);
        }}
        onRegenerate={() => {
          if (constructedResultSource === "idea" && constructedSeedIdea) {
            void runConstructedFullDeck({ idea: constructedSeedIdea, source: "idea" });
          } else if (constructedResultSource === "skeleton" && constructedSeedSkeleton) {
            void runConstructedFullDeck({ skeleton: constructedSeedSkeleton, source: "skeleton" });
          } else {
            void runConstructedFullDeck({ source: "direct" });
          }
        }}
        onCreateDeck={handleCreateConstructedDeck}
        isCreating={creating}
        isRegenerating={loading}
        requireAuth
        isGuest={!user}
      />
    );
  }

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
          <button
            type="button"
            onClick={cancelGeneration}
            className="mt-5 rounded-lg border border-neutral-600 bg-neutral-950/80 px-4 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Cancel generation
          </button>
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

          <div className="mb-5">
            <label className="mb-2 block text-sm text-neutral-400">Format</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {COLLECTION_FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setFormat(option.id);
                    setError(null);
                    clearConstructedOutputs();
                    if (option.id === "Commander") {
                      setConstructedQuizOpen(false);
                    } else {
                      setQuizDone(false);
                      setQuizIndex(0);
                      setQuizAnswers({});
                    }
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    format === option.id
                      ? "border-purple-500 bg-purple-900/30 text-white"
                      : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600"
                  }`}
                >
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className="block text-[11px] text-neutral-500">{option.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Commander tabs */}
          {format === "Commander" && (
            <div className="flex gap-2 mb-6">
              {(["guided", "quiz", "quick"] as Tab[]).map((t) => (
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
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
              {error}
              {!isPro && error.toLowerCase().includes("limit") && (
                <a href="/pricing" className="block mt-2 text-amber-300 hover:text-amber-200 font-medium">
                  Upgrade to Pro →
                </a>
              )}
              {!error.toLowerCase().includes("cancelled") ? (
                <a
                  href={`mailto:support@manatap.app?subject=${encodeURIComponent("Build from collection issue")}&body=${encodeURIComponent(error)}`}
                  className="mt-2 block font-medium text-red-100 underline underline-offset-2 hover:text-white"
                >
                  Report this issue
                </a>
              ) : null}
            </div>
          )}

          <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <label className="block text-sm text-neutral-400 mb-1">Cards from collection</label>
            <select
              value={ownershipMode}
              onChange={(e) => setOwnershipMode(e.target.value as CollectionOwnershipMode)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="mostly_collection">Mostly owned (~75%+ from collection)</option>
              <option value="collection_only">Only owned cards</option>
              <option value="best_with_missing">Best deck (highlight missing)</option>
            </select>
          </div>

          {format === "Commander" && tab === "guided" && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-400">
                Not sure about your vibe?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setTab("quiz");
                    setError(null);
                  }}
                  className="text-purple-300 hover:text-purple-200 underline underline-offset-2"
                >
                  Take the playstyle quiz
                </button>{" "}
                first — we&apos;ll prefill commander suggestions and preferences.
              </p>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Commander (from collection or search)
                </label>
                <CardAutocomplete
                  value={commander}
                  onChange={setCommander}
                  onPick={setCommander}
                  placeholder="Search for a commander…"
                  searchUrl="/api/cards/search-commanders"
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
                {loading ? "Generating..." : "Generate Deck"}
              </button>
            </div>
          )}

          {format === "Commander" && tab === "quick" && (
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

          {format === "Commander" && tab === "quiz" && !quizDone && (
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

          {format === "Commander" && tab === "quiz" && quizDone && (
            <div className="space-y-4">
              <p className="text-neutral-300">
                Your profile: <strong className="text-white">{quizProfile}</strong>
              </p>
              <p className="text-xs text-neutral-500">
                Power {powerLevel} · Budget {budget} — applied to this build.
              </p>
              <p className="text-sm text-neutral-400">
                Pick a commander (prioritizing those in your collection):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {commandersToShow.slice(0, 8).map((c) => {
                  const img = commanderImages[c.name];
                  const imageSrc = img?.normal || img?.small;
                  const hoverAttrs = imageSrc ? (bind(imageSrc) as any) : {};
                  const selected = activeQuizCommander === c.name;
                  return (
                    <button
                      key={c.name}
                      onMouseEnter={hoverAttrs.onMouseEnter as any}
                      onMouseMove={hoverAttrs.onMouseMove as any}
                      onMouseLeave={hoverAttrs.onMouseLeave as any}
                      onClick={() => {
                        setSelectedCommander(c.name);
                        window.dispatchEvent(new Event("manatap-hide-hover-preview"));
                      }}
                      className={`group flex min-h-[72px] items-center gap-3 text-left p-2 rounded-lg border transition-colors ${
                        selected
                          ? "border-purple-500 bg-purple-900/30"
                          : "border-neutral-700 hover:border-neutral-600 bg-neutral-900"
                      }`}
                    >
                      <span className="h-14 w-10 overflow-hidden rounded bg-neutral-800 border border-neutral-700 flex-shrink-0">
                        {imageSrc ? (
                          <img
                            src={img?.small || imageSrc}
                            alt={c.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white">{c.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-neutral-400">{c.archetype}</span>
                          {typeof c.matchPct === "number" && (
                            <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-200">
                              {c.matchPct}% match
                            </span>
                          )}
                          {inCollection.has(c.name.toLowerCase().trim()) && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                              In collection
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleQuizGuided}
                  disabled={loading || !activeQuizCommander}
                  className="w-full py-3 border border-purple-500/60 bg-purple-950/40 hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed text-purple-100 font-bold rounded-lg"
                >
                  Use in Guided Builder
                </button>
                <button
                  onClick={handleQuizBuild}
                  disabled={loading || !activeQuizCommander}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg"
                >
                  {loading ? "Generating..." : "Build It For Me"}
                </button>
              </div>
            </div>
          )}

          {isConstructedFormat(format) && (
            <div className="space-y-5">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-sm font-semibold text-emerald-100">
                  {format} collection build
                </p>
                <p className="mt-1 text-xs text-emerald-100/75">
                  Uses the constructed builder for 60-card mainboards and 15-card sideboards.
                </p>
              </div>

              {constructedQuizOpen && activeConstructedQuizQuestion ? (
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-neutral-400">
                        Question {constructedQuizIndex + 1} of {constructedQuizQuestions.length}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {activeConstructedQuizQuestion.text}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConstructedQuizOpen(false)}
                      className="text-sm text-neutral-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="space-y-2">
                    {activeConstructedQuizQuestion.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleConstructedQuizAnswer(option.value)}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left text-sm text-neutral-200 hover:border-purple-500"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConstructedQuizIndex((index) => Math.max(0, index - 1))}
                    disabled={constructedQuizIndex === 0}
                    className="mt-3 text-sm text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    Back
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {constructedQuizProfile ? `Quiz profile: ${constructedQuizProfile}` : "Tune with a playstyle quiz"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        Applies direction, power, budget, archetype, and notes for constructed formats.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConstructedQuizOpen(true);
                        setConstructedQuizIndex(0);
                      }}
                      className="rounded-lg border border-purple-500/50 px-3 py-2 text-sm font-semibold text-purple-100 hover:bg-purple-900/30"
                    >
                      {constructedQuizProfile ? "Retake Quiz" : "Take Quiz"}
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-neutral-400">Direction</label>
                      <div className="grid gap-2">
                        {CONSTRUCTED_DIRECTION_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setConstructedDirection(option.id)}
                            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                              constructedDirection === option.id
                                ? "border-emerald-500 bg-emerald-500/15 text-white"
                                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="block text-xs text-neutral-500">{option.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-neutral-400">Output</label>
                      <div className="grid gap-2">
                        {CONSTRUCTED_OUTPUT_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setConstructedOutputMode(option.id);
                              setError(null);
                            }}
                            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                              constructedOutputMode === option.id
                                ? "border-purple-500 bg-purple-900/30 text-white"
                                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="block text-xs text-neutral-500">{option.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm text-neutral-400">Power</label>
                        <select
                          value={powerLevel}
                          onChange={(event) => setPowerLevel(event.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                        >
                          {POWER_LEVELS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-neutral-400">Budget</label>
                        <select
                          value={budget}
                          onChange={(event) => setBudget(event.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                        >
                          {BUDGETS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm text-neutral-400">Colors (optional)</label>
                      <div className="flex flex-wrap gap-2">
                        {CONSTRUCTED_COLOR_OPTIONS.map((color) => {
                          const selected = constructedColors.includes(color.id);
                          return (
                            <button
                              key={color.id}
                              type="button"
                              onClick={() =>
                                setConstructedColors((current) =>
                                  current.includes(color.id)
                                    ? current.filter((value) => value !== color.id)
                                    : [...current, color.id],
                                )
                              }
                              className={`h-10 min-w-16 rounded-lg border px-3 text-sm font-bold ${
                                selected
                                  ? "border-amber-300 bg-amber-300 text-black"
                                  : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-amber-300/60"
                              }`}
                              title={color.label}
                            >
                              {color.id}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div>
                        <label className="mb-1 block text-sm text-neutral-400">Archetype / theme</label>
                        <input
                          value={constructedArchetype}
                          onChange={(event) => setConstructedArchetype(event.target.value)}
                          placeholder={`e.g. ${format} tempo, burn, graveyard`}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white placeholder:text-neutral-500"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm text-neutral-400">Prefer including</label>
                          <textarea
                            value={constructedInclude}
                            onChange={(event) => setConstructedInclude(event.target.value)}
                            rows={3}
                            placeholder="Card names, one per line or comma-separated"
                            className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-neutral-400">Avoid</label>
                          <textarea
                            value={constructedAvoid}
                            onChange={(event) => setConstructedAvoid(event.target.value)}
                            rows={3}
                            placeholder="Cards, styles, or strategies to avoid"
                            className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-neutral-400">Notes</label>
                        <textarea
                          value={constructedNotes}
                          onChange={(event) => setConstructedNotes(event.target.value)}
                          rows={3}
                          placeholder="Matchups, pet cards, local meta, or budget notes"
                          className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConstructedGenerate}
                    disabled={loading}
                    className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 py-3 font-bold text-white hover:from-green-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? "Generating..."
                      : constructedOutputMode === "ideas"
                        ? "Generate Deck Ideas"
                        : constructedOutputMode === "skeleton"
                          ? "Build Deck Skeleton"
                          : "Build Full Deck"}
                  </button>
                </div>
              )}

              {constructedIdeas?.length ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">Deck ideas</h3>
                      <p className="text-xs text-neutral-400">
                        {typeof constructedIdeasMeta?.collectionSampleSize === "number"
                          ? `${constructedIdeasMeta.collectionSampleSize} collection cards analysed`
                          : "Pick one to build into a full deck."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConstructedIdeas(null);
                        setConstructedIdeasMeta(null);
                      }}
                      className="text-sm text-neutral-400 hover:text-white"
                    >
                      Clear ideas
                    </button>
                  </div>
                  <div className="grid gap-3">
                    {constructedIdeas.map((idea) => (
                      <div key={idea.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{idea.title}</p>
                            <p className="mt-1 text-xs text-neutral-400">
                              {idea.archetype} / {idea.colors?.join("") || format}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void runConstructedFullDeck({ idea, source: "idea" })}
                            disabled={loading}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Build full deck
                          </button>
                        </div>
                        <p className="mt-3 text-sm text-neutral-300">{idea.reason}</p>
                        {idea.ownedCoreCards?.length ? (
                          <p className="mt-2 text-xs text-emerald-300">
                            Owned core: {idea.ownedCoreCards.slice(0, 8).join(", ")}
                          </p>
                        ) : null}
                        {idea.missingKeyCards?.length ? (
                          <p className="mt-1 text-xs text-amber-300">
                            Missing: {idea.missingKeyCards.slice(0, 8).join(", ")}
                          </p>
                        ) : null}
                        {idea.warnings?.length ? (
                          <p className="mt-1 text-xs text-red-300">{idea.warnings.join(" ")}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {constructedIdeasMeta?.notes?.length ? (
                    <p className="mt-3 text-xs text-neutral-500">{constructedIdeasMeta.notes.join(" ")}</p>
                  ) : null}
                </div>
              ) : null}

              {constructedSkeleton ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{constructedSkeleton.title}</h3>
                      <p className="text-xs text-neutral-400">
                        {constructedSkeleton.archetype} / {constructedSkeleton.colors?.join("") || format}
                        {typeof constructedSkeletonMeta?.collectionSampleSize === "number"
                          ? ` / ${constructedSkeletonMeta.collectionSampleSize} cards analysed`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runConstructedFullDeck({ skeleton: constructedSkeleton, source: "skeleton" })}
                      disabled={loading}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Build full deck
                    </button>
                  </div>
                  {constructedSkeleton.gamePlan?.length ? (
                    <div className="mb-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Game plan</p>
                      <ul className="space-y-1 text-sm text-neutral-300">
                        {constructedSkeleton.gamePlan.map((line, index) => (
                          <li key={`${line}-${index}`}>- {line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {constructedSkeleton.coreCards?.length ? (
                    <p className="mb-2 text-xs text-emerald-300">
                      Core: {constructedSkeleton.coreCards.map((card) => card.name).slice(0, 14).join(", ")}
                    </p>
                  ) : null}
                  {constructedSkeleton.suggestedPackages?.length ? (
                    <div className="grid gap-2">
                      {constructedSkeleton.suggestedPackages.slice(0, 3).map((pkg) => (
                        <div key={pkg.title} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                          <p className="text-sm font-semibold text-white">{pkg.title}</p>
                          <p className="mt-1 text-xs text-neutral-400">{pkg.reason}</p>
                          <p className="mt-1 text-xs text-neutral-300">{pkg.cards.join(", ")}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {constructedSkeleton.sideboardPlan?.length ? (
                    <p className="mt-3 text-xs text-blue-200">
                      Sideboard plan: {constructedSkeleton.sideboardPlan.join(" ")}
                    </p>
                  ) : null}
                  {constructedSkeleton.missingHighlights?.length ? (
                    <p className="mt-2 text-xs text-amber-300">
                      Missing highlights: {constructedSkeleton.missingHighlights.join(", ")}
                    </p>
                  ) : null}
                  {constructedSkeleton.warnings?.length ? (
                    <p className="mt-2 text-xs text-red-300">{constructedSkeleton.warnings.join(" ")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {hoverPreview}
    </div>
  );

  return createPortal(modal, document.body);
}
