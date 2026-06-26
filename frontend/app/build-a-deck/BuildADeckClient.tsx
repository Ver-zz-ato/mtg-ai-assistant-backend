"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clipboard,
  Compass,
  Copy,
  FileText,
  Gauge,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import CardAutocomplete from "@/components/CardAutocomplete";
import ManaSymbol from "@/components/ManaSymbol";

type BuildFormat = AnalyzeFormat;
type Budget = "Budget" | "Moderate" | "High";
type Power = "Casual" | "Mid" | "Focused" | "Optimized" | "Competitive";
type BuildMode = "full" | "core_shell" | "staples_flex";

type GeneratedDeck = {
  title: string;
  format: string;
  deckText: string;
  commander?: string;
  colors?: string[];
  plan?: string;
  estimatedPriceUsd?: number | null;
  warnings?: string[];
  explanation?: string[];
};

const formats: BuildFormat[] = ["Commander", "Modern", "Pioneer", "Standard", "Pauper"];
const budgets: Budget[] = ["Budget", "Moderate", "High"];
const powers: Power[] = ["Casual", "Mid", "Focused", "Optimized", "Competitive"];

const buildModes: Array<{ id: BuildMode; label: string; helper: string }> = [
  { id: "full", label: "Full deck", helper: "Complete list ready to review." },
  { id: "core_shell", label: "Core shell", helper: "Key engine, lands, and role backbone." },
  { id: "staples_flex", label: "Staples + flex", helper: "Reliable staples with editable flex slots." },
];

const pipeline = [
  { label: "Choose", helper: "Format and deck seed", icon: Compass },
  { label: "Shape", helper: "Power, budget, mode", icon: Gauge },
  { label: "Generate", helper: "AI builds the first list", icon: Wand2 },
  { label: "Review", helper: "Warnings and role checks", icon: BookOpenCheck },
  { label: "Tune", helper: "Save, check, upgrade", icon: ShieldCheck },
];

const sampleIdeas = [
  {
    title: "Go-wide Goblins that win with token damage",
    commander: "Krenko, Mob Boss",
    idea: "Go-wide Goblins that win with token damage, haste, sacrifice mana, and damage finishers.",
    art: "https://cards.scryfall.io/art_crop/front/8/2/824b2d73-2151-4e5e-9f05-8f63e2bdcaa9.jpg?1730632010",
  },
  {
    title: "Azorius artifacts with cheap interaction",
    commander: "Shorikai, Genesis Engine",
    idea: "Azorius artifacts with cheap interaction, value engines, vehicles, and a clean control finish.",
    art: "https://cards.scryfall.io/art_crop/front/9/6/969ac7dd-f3aa-4888-9ff0-d16a31b5e7a9.jpg?1763728107",
  },
  {
    title: "Graveyard value with sacrifice loops",
    commander: "Meren of Clan Nel Toth",
    idea: "Graveyard value deck with sacrifice outlets, recursive creatures, and grindy Golgari payoffs.",
    art: "https://cards.scryfall.io/art_crop/front/5/0/508b1442-bf2c-4ad6-9bcf-bd894e081ab6.jpg?1743207181",
  },
];

function toConstructedBudget(budget: Budget): "budget" | "balanced" | "premium" {
  if (budget === "Budget") return "budget";
  if (budget === "High") return "premium";
  return "balanced";
}

function toConstructedPower(power: Power): "casual" | "strong" | "competitive" {
  if (power === "Competitive" || power === "Optimized") return "competitive";
  if (power === "Focused") return "strong";
  return "casual";
}

function apiBuildMode(mode: BuildMode) {
  if (mode === "core_shell") return "core_shell";
  if (mode === "staples_flex") return "staples_flex";
  return null;
}

function deckLineCount(text: string) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !/^mainboard$|^sideboard$|^commander$|^deck$/i.test(line.trim())).length;
}

function parseIdeaTitle(idea: string) {
  const clean = idea.trim();
  if (!clean) return "Fresh MTG deck";
  return clean.length > 62 ? `${clean.slice(0, 59)}...` : clean;
}

const mtgColors = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue" },
  { key: "B", label: "Black" },
  { key: "R", label: "Red" },
  { key: "G", label: "Green" },
] as const;

export default function BuildADeckClient() {
  const [format, setFormat] = useState<BuildFormat>("Commander");
  const [commander, setCommander] = useState("Krenko, Mob Boss");
  const [idea, setIdea] = useState("Fast Goblin token deck with haste, sacrifice mana, and damage finishers.");
  const [colors, setColors] = useState("R");
  const [budget, setBudget] = useState<Budget>("Moderate");
  const [power, setPower] = useState<Power>("Focused");
  const [buildMode, setBuildMode] = useState<BuildMode>("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedDeck | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const commanderParam = new URLSearchParams(window.location.search).get("commander")?.trim();
    if (!commanderParam) return;
    setFormat("Commander");
    setCommander(commanderParam);
    setIdea(`Build a Commander deck around ${commanderParam}. Prioritize the commander's core synergies, interaction, ramp, draw, and a clear win plan.`);
    setResult(null);
    setError(null);
  }, []);

  const isCommander = format === "Commander";
  const canGenerate = isCommander ? commander.trim().length > 1 || idea.trim().length > 3 : idea.trim().length > 3;
  const currentLines = result ? deckLineCount(result.deckText) : 0;

  const planSummary = useMemo(() => {
    const seed = isCommander ? commander.trim() || "a commander you choose" : idea.trim() || "your archetype";
    return `${power} ${budget.toLowerCase()} ${format} deck around ${seed}`;
  }, [budget, commander, format, idea, isCommander, power]);

  async function generateDeck() {
    if (!canGenerate) {
      setError(isCommander ? "Add a commander or seed idea first." : "Add a deck idea or archetype first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setCopied(false);

      if (isCommander) {
        // Same-origin App Router route; fetchJson targets the backend proxy prefix in dev.
        // eslint-disable-next-line no-restricted-globals
        const res = await fetch("/api/deck/generate-from-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commander: commander.trim() || undefined,
            seedCard: !commander.trim() ? idea.trim() : undefined,
            playstyle: idea.trim() || "balanced",
            powerLevel: power,
            budget,
            format: "Commander",
            generationIntent: commander.trim() ? "idea_to_deck" : "build_around_card",
            buildMode: apiBuildMode(buildMode),
            collectionOwnershipMode: "any",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          if (res.status === 401) {
            window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "signup" } }));
            throw new Error("Sign in to generate and save Commander decks.");
          }
          throw new Error(data?.error || "Generation failed.");
        }
        setResult({
          title: data.title || `${commander || "Commander"} deck`,
          format: data.format || "Commander",
          deckText: data.deckText || "",
          commander: data.commander,
          colors: data.colors,
          plan: data.plan,
        });
        setActiveStep(3);
        return;
      }

      const selectedColors = colors
        .toUpperCase()
        .replace(/[^WUBRG]/g, "")
        .split("")
        .filter((color, index, all) => all.indexOf(color) === index);

      // Same-origin App Router route; fetchJson targets the backend proxy prefix in dev.
      // eslint-disable-next-line no-restricted-globals
      const res = await fetch("/api/deck/generate-constructed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          colors: selectedColors,
          archetype: idea.trim(),
          budget: toConstructedBudget(budget),
          powerLevel: toConstructedPower(power),
          notes: `Build mode: ${buildModes.find((mode) => mode.id === buildMode)?.label || "Full deck"}. ${idea.trim()}`,
          generationIntent: "idea_to_deck",
          seedFromIdea: {
            title: parseIdeaTitle(idea),
            archetype: idea.trim(),
            colors: selectedColors,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Generation failed.");
      setResult({
        title: data.title || `${format} deck`,
        format: data.format || format,
        deckText: data.deckText || "",
        colors: data.colors,
        estimatedPriceUsd: data.estimatedPriceUsd,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        explanation: Array.isArray(data.explanation) ? data.explanation : [],
      });
      setActiveStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      setError(message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyDeck() {
    if (!result?.deckText) return;
    await navigator.clipboard.writeText(result.deckText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function checkGeneratedDeck() {
    if (result?.deckText) {
      sessionStorage.setItem(
        "manatap_deck_checker_prefill",
        JSON.stringify({ deckText: result.deckText, format: result.format || format }),
      );
    }
    window.location.assign("/mtg-deck-checker");
  }

  function openSignup() {
    window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "signup" } }));
  }

  return (
    <section className="relative overflow-hidden bg-[#050608] text-white">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(103,232,249,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,0.4)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

      <div className="relative mx-auto flex min-h-[calc(100vh-82px)] max-w-7xl flex-col px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
            <Sparkles className="h-4 w-4" aria-hidden />
            Guided AI deck builder
          </div>
          <h1 className="text-5xl font-black leading-[0.92] tracking-normal text-white sm:text-6xl lg:text-7xl">
            Build a Deck
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-300 sm:text-xl">
            Pick a format, set the plan, generate a first list, then review it with ManaTap&apos;s checker before you spend money or sleeve cards.
          </p>

          <div className="mt-10 grid gap-3 md:grid-cols-5">
            {pipeline.map((step, index) => {
              const active = activeStep === index;
              const complete = index < activeStep;
              return (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`min-h-32 rounded-lg border p-4 text-left transition ${
                    active
                      ? "border-amber-300/70 bg-amber-300/10 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
                      : complete
                        ? "border-cyan-300/35 bg-cyan-300/10"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="grid h-11 w-11 place-items-center rounded-md border border-cyan-300/25 bg-cyan-300/10">
                    <step.icon className="h-5 w-5 text-cyan-200" aria-hidden />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-base font-black text-white">
                    <span className="font-mono text-amber-200">{index + 1}</span>
                    {step.label}
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{step.helper}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="#builder"
              onClick={() => setActiveStep(0)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-amber-300 px-6 py-3 text-sm font-black text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.22)] transition hover:bg-amber-200"
            >
              <Play className="h-4 w-4" aria-hidden />
              Start building
            </a>
            <Link
              href="/mtg-deck-checker"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-6 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Check an existing deck
            </Link>
          </div>
        </div>

        <div id="builder" className="mx-auto mt-14 w-full max-w-5xl rounded-lg border border-white/[0.12] bg-zinc-950/[0.82] p-4 shadow-2xl shadow-black/40 backdrop-blur sm:p-6">
          <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <Wand2 className="h-4 w-4 text-amber-300" aria-hidden />
                Step {activeStep + 1}: {pipeline[activeStep]?.label}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{planSummary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pipeline.map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`h-2.5 w-10 rounded-full transition ${
                    activeStep === index ? "bg-amber-300" : index < activeStep ? "bg-cyan-300/70" : "bg-white/15"
                  }`}
                  aria-label={`Go to ${step.label}`}
                />
              ))}
            </div>
          </div>

          {activeStep === 0 ? (
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white">Choose your format and deck seed</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Start with the rules shell, then give ManaTap a commander, archetype, colour pair, or table vibe.</p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {formats.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setFormat(option);
                      setResult(null);
                      setError(null);
                    }}
                    className={`min-h-12 rounded-md border px-3 py-2 text-sm font-black transition ${
                      format === option ? "border-amber-300 bg-amber-300 text-zinc-950" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {isCommander ? (
                  <div>
                    <label htmlFor="commander" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                      Commander
                    </label>
                    <div id="commander" className="mt-2 [&_input]:rounded-md [&_input]:border-white/10 [&_input]:bg-black/45 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:text-zinc-100 [&_input]:placeholder:text-zinc-700 [&_input]:focus:border-amber-300/70 [&_input]:focus:ring-2 [&_input]:focus:ring-amber-300/15">
                      <CardAutocomplete
                        value={commander}
                        onChange={setCommander}
                        onPick={(name) => {
                          setCommander(name);
                          setResult(null);
                          setError(null);
                        }}
                        placeholder="Atraxa, Praetors' Voice"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                      Colours
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {mtgColors.map((color) => {
                        const selected = colors.includes(color.key);
                        return (
                          <button
                            key={color.key}
                            type="button"
                            onClick={() => {
                              setColors((current) => {
                                const next = selected ? current.replace(color.key, "") : `${current}${color.key}`;
                                return mtgColors.map((c) => c.key).filter((key) => next.includes(key)).join("");
                              });
                              setResult(null);
                            }}
                            aria-pressed={selected}
                            className={`grid h-11 w-11 place-items-center rounded-full border transition ${
                              selected
                                ? "border-amber-300 bg-amber-300/15 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
                                : "border-white/10 bg-black/45 opacity-70 hover:opacity-100"
                            }`}
                            title={color.label}
                          >
                            <ManaSymbol symbol={color.key} size="large" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="idea" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                    Deck idea
                  </label>
                  <textarea
                    id="idea"
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    placeholder="Describe the archetype, combo, creature type, theme, cards you own, or vibe."
                    className="mt-2 h-28 w-full resize-none rounded-md border border-white/10 bg-black/45 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15"
                  />
                </div>
              </div>
              <div className="mt-7">
                <div className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-amber-100">
                  Examples to try
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {sampleIdeas.map((sample) => (
                    <button
                      key={sample.title}
                      type="button"
                      onClick={() => {
                        setFormat("Commander");
                        setCommander(sample.commander);
                        setIdea(sample.idea);
                        setResult(null);
                      }}
                      className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] text-left transition hover:border-cyan-300/35 hover:bg-white/[0.07]"
                    >
                      <div className="relative h-24 overflow-hidden">
                        <Image
                          src={sample.art}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 100vw, 260px"
                          className="object-cover opacity-85 transition duration-300 group-hover:scale-105 group-hover:opacity-100"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
                      </div>
                      <div className="p-4">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">{sample.commander}</div>
                        <h3 className="mt-2 text-sm font-black leading-5 text-white">{sample.title}</h3>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 1 ? (
            <div className="mx-auto max-w-4xl">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white">Shape the deck</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Choose the power band, spend level, and how complete the first draft should be.</p>
              </div>
              <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Power</div>
                  <div className="mt-3 grid gap-2">
                    {powers.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPower(option)}
                        className={`min-h-11 rounded-md border px-4 py-2 text-left text-sm font-black transition ${
                          power === option ? "border-cyan-300 bg-cyan-300 text-zinc-950" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Budget</div>
                  <div className="mt-3 grid gap-2">
                    {budgets.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setBudget(option)}
                        className={`min-h-11 rounded-md border px-4 py-2 text-left text-sm font-black transition ${
                          budget === option ? "border-cyan-300 bg-cyan-300 text-zinc-950" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Mode</div>
                  <div className="mt-3 grid gap-2">
                    {buildModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setBuildMode(mode.id)}
                        className={`rounded-md border p-4 text-left transition ${
                          buildMode === mode.id ? "border-amber-300/70 bg-amber-300/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                        }`}
                      >
                        <div className="text-sm font-black text-white">{mode.label}</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">{mode.helper}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 2 ? (
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg border border-amber-300/35 bg-amber-300/10">
                <Wand2 className="h-7 w-7 text-amber-200" aria-hidden />
              </div>
              <h2 className="mt-5 text-3xl font-black text-white">Generate the first draft</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{planSummary}</p>
              <div className="mt-6 grid grid-cols-3 gap-2 text-left">
                {[["Format", format], ["Power", power], ["Budget", budget]].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="text-xs text-zinc-500">{label}</div>
                    <div className="mt-1 truncate text-sm font-black text-zinc-100">{value}</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={generateDeck}
                disabled={busy || !canGenerate}
                className="mt-7 inline-flex min-h-12 min-w-64 items-center justify-center gap-2 rounded-md bg-amber-300 px-6 py-3 text-sm font-black text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Zap className="h-4 w-4 animate-pulse" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                {busy ? "Building deck..." : "Build my deck"}
              </button>
              {error && (
                <div className="mx-auto mt-4 flex max-w-xl gap-2 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-left text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : null}

          {activeStep === 3 ? (
            <div className="mx-auto max-w-4xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Review</div>
                  <h2 className="mt-2 text-3xl font-black text-white">{result?.title || "No draft yet"}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{result ? `${currentLines} deck lines generated` : "Generate a draft first, then review the output here."}</p>
                </div>
                {result?.deckText ? (
                  <button
                    type="button"
                    onClick={copyDeck}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    {copied ? "Copied" : "Copy deck"}
                  </button>
                ) : null}
              </div>
              <div className="mt-5 rounded-md border border-white/10 bg-black/35">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-black text-white">
                  <FileText className="h-4 w-4 text-amber-300" aria-hidden />
                  Output
                </div>
                <pre className="h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-zinc-300">
                  {result?.deckText ||
                    `Commander\n1 ${commander || "Your Commander"}\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n...\n\nSet the plan, then generate a reviewable first draft.`}
                </pre>
              </div>
              {result?.warnings?.length ? (
                <div className="mt-4 rounded-md border border-amber-300/25 bg-amber-300/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-amber-100">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    Review notes
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-5 text-amber-50/80">
                    {result.warnings.slice(0, 3).map((warning) => (
                      <li key={warning} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-300" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStep === 4 ? (
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-300/10">
                <CheckCircle2 className="h-7 w-7 text-cyan-200" aria-hidden />
              </div>
              <h2 className="mt-5 text-3xl font-black text-white">Tune and finish</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Run the generated list through Deck Checker to catch land count, role balance, format issues, and expensive mistakes before you commit.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={checkGeneratedDeck}
                  disabled={!result?.deckText}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-300/40 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Clipboard className="h-4 w-4" aria-hidden />
                  Check this deck
                </button>
                <button
                  type="button"
                  onClick={openSignup}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/10 px-5 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  Save in ManaTap
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row">
            <button
              type="button"
              onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              disabled={activeStep === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setActiveStep((step) => Math.min(pipeline.length - 1, step + 1))}
              disabled={activeStep === pipeline.length - 1}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-amber-300 px-5 py-2 text-sm font-black text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next step
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
