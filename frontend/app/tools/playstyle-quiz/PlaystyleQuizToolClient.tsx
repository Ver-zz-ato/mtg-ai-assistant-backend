"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUIZ_QUESTIONS,
  calculateProfile,
  computeTraits,
  getTraitLabel,
  type PlaystyleProfile,
  type PlaystyleTraits,
} from "@/lib/quiz/quiz-data";
import { getCommanderSuggestionsWithMatch, getArchetypeSuggestionsWithMatch } from "@/lib/quiz/commander-suggestions";
import {
  deriveConstructedArchetypeFromQuizAnswers,
  deriveConstructedBudgetFromQuizAnswers,
  deriveConstructedDirectionFromQuizAnswers,
  deriveConstructedPowerFromQuizAnswers,
  deriveConstructedProfileLabel,
  getConstructedQuizQuestions,
  type ConstructedFormat,
} from "@/lib/build/collectionConstructedPayload";
import { saveBuildDeckHandoff } from "@/lib/build/buildDeckHandoff";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";

type QuizFormat = AnalyzeFormat;

const FORMATS: Array<{ id: QuizFormat; label: string; sub: string }> = [
  { id: "Commander", label: "Commander", sub: "Commander suggestions and 100-card handoff" },
  { id: "Modern", label: "Modern", sub: "Fast 60-card constructed" },
  { id: "Pioneer", label: "Pioneer", sub: "Non-rotating 60-card constructed" },
  { id: "Standard", label: "Standard", sub: "Rotating 60-card constructed" },
  { id: "Pauper", label: "Pauper", sub: "Commons-focused 60-card constructed" },
];

function isConstructed(format: QuizFormat): format is ConstructedFormat {
  return format !== "Commander";
}

function colorsForConstructed(format: ConstructedFormat, answers: Record<string, string>): string[] {
  const theme = answers.theme;
  const pace = answers.pace;
  if (theme === "spells") return ["U", "R"];
  if (theme === "tokens") return ["W", "G"];
  if (theme === "graveyard") return ["B", "G"];
  if (theme === "artifacts") return ["U", "R"];
  if (theme === "enchantments") return ["W", "G"];
  if (pace === "control") return ["W", "U"];
  if (pace === "combo") return ["U", "B"];
  if (pace === "aggro") return format === "Pauper" ? ["R"] : ["R", "W"];
  return ["B", "G"];
}

function explainConstructed(answers: Record<string, string>) {
  const pace = answers.pace || "value";
  const theme = answers.theme || "midrange";
  const avoid = answers.avoid ? `Avoid: ${answers.avoid}.` : "";
  return `Quiz result: ${pace} pace, ${theme} shell. ${avoid}`.trim();
}

export default function PlaystyleQuizToolClient() {
  const router = useRouter();
  const [format, setFormat] = useState<QuizFormat>("Commander");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [selectedCommander, setSelectedCommander] = useState("");
  const [images, setImages] = useState<Record<string, { small?: string; normal?: string; art_crop?: string }>>({});

  const questions = useMemo(() => {
    if (isConstructed(format)) return getConstructedQuizQuestions(format);
    return QUIZ_QUESTIONS.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.answers.map((answer) => ({ value: answer.id, label: answer.text })),
    }));
  }, [format]);

  const commanderResult = useMemo(() => {
    if (!done || isConstructed(format)) return null;
    const profile = calculateProfile(answers);
    const traits = computeTraits(answers);
    return {
      profile,
      traits,
      commanders: getCommanderSuggestionsWithMatch(profile, traits),
      archetypes: getArchetypeSuggestionsWithMatch(profile, traits),
    };
  }, [answers, done, format]);

  const constructedResult = useMemo(() => {
    if (!done || !isConstructed(format)) return null;
    const colors = colorsForConstructed(format, answers);
    const profileLabel = deriveConstructedProfileLabel(answers);
    const archetype = deriveConstructedArchetypeFromQuizAnswers(format, answers);
    const power = deriveConstructedPowerFromQuizAnswers(answers);
    const budget = deriveConstructedBudgetFromQuizAnswers(answers);
    const direction = deriveConstructedDirectionFromQuizAnswers(answers);
    return { colors, profileLabel, archetype, power, budget, direction };
  }, [answers, done, format]);

  useEffect(() => {
    if (!commanderResult?.commanders.length) return;
    const names = commanderResult.commanders.slice(0, 6).map((row) => row.name);
    if (!selectedCommander) setSelectedCommander(names[0] || "");
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    })
      .then((res) => res.json())
      .then((json) => {
        const next: Record<string, { small?: string; normal?: string; art_crop?: string }> = {};
        (json?.data || []).forEach((card: { name: string; image_uris?: { small?: string; normal?: string; art_crop?: string } }) => {
          if (card?.name && card?.image_uris) next[card.name] = card.image_uris;
        });
        setImages(next);
      })
      .catch(() => {});
  }, [commanderResult, selectedCommander]);

  function answerCurrent(value: string) {
    const question = questions[index];
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    if (index >= questions.length - 1) {
      setDone(true);
      return;
    }
    setIndex((current) => current + 1);
  }

  function reset(nextFormat = format) {
    setFormat(nextFormat);
    setIndex(0);
    setAnswers({});
    setDone(false);
    setSelectedCommander("");
    setImages({});
  }

  function openBuilder() {
    if (commanderResult) {
      const commander = selectedCommander || commanderResult.commanders[0]?.name || "";
      saveBuildDeckHandoff({
        format: "Commander",
        commander,
        idea: `Build a ${commanderResult.profile.label} Commander deck around ${commander}. ${commanderResult.profile.description}`,
        budget: answers.budget === "budget" || answers.budget === "own" ? "Budget" : "Moderate",
        power: commanderResult.traits.comboAppetite > 70 || commanderResult.traits.control > 70 ? "Focused" : "Casual",
        sourceLabel: "Playstyle Quiz",
      });
      router.push("/build-a-deck");
      return;
    }
    if (constructedResult && isConstructed(format)) {
      saveBuildDeckHandoff({
        format,
        idea: `${constructedResult.archetype}. ${explainConstructed(answers)}`,
        colors: constructedResult.colors,
        budget: constructedResult.budget as "Budget" | "Moderate" | "High",
        power: constructedResult.power as "Casual" | "Mid" | "Focused" | "Optimized" | "Competitive",
        sourceLabel: "Playstyle Quiz",
      });
      router.push("/build-a-deck");
    }
  }

  const progress = done ? 100 : Math.round(((index + 1) / questions.length) * 100);
  const currentQuestion = questions[index];

  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href="/tools" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
            Tools
          </Link>
          <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Playstyle Quiz</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Pick a format, answer a few deck-building questions, then open the right ManaTap builder with your result prefilled.
          </p>
        </div>

        <div className="mb-5 grid gap-2 md:grid-cols-5">
          {FORMATS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => reset(opt.id)}
              className={`min-h-24 rounded-lg border p-3 text-left transition ${
                format === opt.id
                  ? "border-cyan-300 bg-cyan-300/15 text-cyan-50"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-cyan-300/35"
              }`}
            >
              <span className="block text-sm font-black">{opt.label}</span>
              <span className="mt-1 block text-xs text-zinc-500">{opt.sub}</span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/30">
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{done ? "Result ready" : `Question ${index + 1} of ${questions.length}`}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {!done ? (
            <div>
              <h2 className="text-2xl font-black text-white">{currentQuestion.text}</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {currentQuestion.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => answerCurrent(option.value)}
                    className="rounded-lg border border-neutral-800 bg-black/35 p-4 text-left text-sm font-semibold text-zinc-200 transition hover:border-purple-400/60 hover:bg-purple-500/10"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-between">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setIndex((current) => Math.max(0, current - 1))}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => reset()}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Restart
                </button>
              </div>
            </div>
          ) : commanderResult ? (
            <CommanderResult
              result={commanderResult}
              images={images}
              selectedCommander={selectedCommander}
              onSelectCommander={setSelectedCommander}
              onOpenBuilder={openBuilder}
              onRestart={() => reset()}
            />
          ) : constructedResult ? (
            <ConstructedResult
              result={constructedResult}
              format={format}
              answers={answers}
              onOpenBuilder={openBuilder}
              onRestart={() => reset()}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function TraitBar({ traits }: { traits: PlaystyleTraits }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {(Object.keys(traits) as Array<keyof PlaystyleTraits>).map((key) => (
        <div key={key} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-neutral-400">{getTraitLabel(key)}</span>
            <span className="font-mono text-cyan-200">{traits[key]}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${traits[key]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommanderResult({
  result,
  images,
  selectedCommander,
  onSelectCommander,
  onOpenBuilder,
  onRestart,
}: {
  result: {
    profile: PlaystyleProfile;
    traits: PlaystyleTraits;
    commanders: ReturnType<typeof getCommanderSuggestionsWithMatch>;
    archetypes: ReturnType<typeof getArchetypeSuggestionsWithMatch>;
  };
  images: Record<string, { small?: string; normal?: string; art_crop?: string }>;
  selectedCommander: string;
  onSelectCommander: (name: string) => void;
  onOpenBuilder: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-200">Commander profile</p>
        <h2 className="mt-2 text-3xl font-black text-white">{result.profile.label}</h2>
        <p className="mt-2 text-sm text-zinc-300">{result.profile.description}</p>
      </div>

      <TraitBar traits={result.traits} />

      <div>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Pick a commander</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {result.commanders.slice(0, 6).map((commander) => {
            const selected = selectedCommander === commander.name;
            const image = images[commander.name];
            return (
              <button
                key={commander.name}
                type="button"
                onClick={() => onSelectCommander(commander.name)}
                className={`overflow-hidden rounded-lg border text-left transition ${
                  selected ? "border-cyan-300 bg-cyan-300/15" : "border-neutral-800 bg-black/35 hover:border-cyan-300/40"
                }`}
              >
                <div className="h-28 bg-neutral-900">
                  {image?.art_crop || image?.normal || image?.small ? (
                    <img src={image.art_crop || image.normal || image.small} alt={commander.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="text-sm font-black text-white">{commander.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">{commander.matchPct || 75}% match / {commander.archetype}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{commander.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onOpenBuilder}
          className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-500 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-cyan-400"
        >
          Open Builder With This Commander
        </button>
        <Link href="/collections" className="rounded-lg border border-neutral-700 px-4 py-3 text-center text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Build From Collection
        </Link>
        <button type="button" onClick={onRestart} className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Retake
        </button>
      </div>
    </div>
  );
}

function ConstructedResult({
  result,
  format,
  answers,
  onOpenBuilder,
  onRestart,
}: {
  result: {
    colors: string[];
    profileLabel: string;
    archetype: string;
    power: string;
    budget: string;
    direction: string;
  };
  format: QuizFormat;
  answers: Record<string, string>;
  onOpenBuilder: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Constructed profile</p>
        <h2 className="mt-2 text-3xl font-black text-white">{result.profileLabel}</h2>
        <p className="mt-2 text-sm text-zinc-300">
          {format} {result.archetype}, {result.colors.join("") || "open colors"}, {result.direction} direction.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Format" value={format} />
        <Info label="Power" value={result.power} />
        <Info label="Budget" value={result.budget} />
        <Info label="Colors" value={result.colors.join("") || "Open"} />
      </div>

      <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Builder notes</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-300">{explainConstructed(answers)}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onOpenBuilder}
          className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-500 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-cyan-400"
        >
          Open 60-Card Builder
        </button>
        <Link href="/collections" className="rounded-lg border border-neutral-700 px-4 py-3 text-center text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Build From Collection
        </Link>
        <button type="button" onClick={onRestart} className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Retake
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}
