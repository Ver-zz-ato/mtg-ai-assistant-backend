"use client";

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
  Layers3,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";

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
  "Go-wide Goblins that wins with token damage",
  "Azorius artifacts with cheap interaction",
  "Graveyard value deck with a sacrifice subtheme",
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

function formatColors(colors: string[] | undefined) {
  if (!colors?.length) return "Any";
  return colors.join("");
}

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

      <div className="relative mx-auto flex min-h-[calc(100vh-82px)] max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Guided AI deck builder
            </div>
            <h1 className="max-w-xl text-4xl font-black leading-[0.95] tracking-normal text-white sm:text-5xl lg:text-6xl">
              Build a Deck
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
              Pick a format, set the plan, generate a first list, then review it with ManaTap&apos;s checker before you spend money or sleeve cards.
            </p>

            <div className="mt-7 grid max-w-xl gap-2">
              {pipeline.map((step, index) => (
                <div key={step.label} className="grid grid-cols-[44px_1fr] items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md border border-cyan-300/25 bg-cyan-300/10">
                    <step.icon className="h-4 w-4 text-cyan-200" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-black text-white">
                      <span className="font-mono text-amber-200">{index + 1}</span>
                      {step.label}
                    </div>
                    <div className="text-xs text-zinc-500">{step.helper}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="#builder"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-black text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.22)] transition hover:bg-amber-200"
              >
                <Play className="h-4 w-4" aria-hidden />
                Start building
              </a>
              <Link
                href="/mtg-deck-checker"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Check an existing deck
              </Link>
            </div>
          </div>

          <div id="builder" className="rounded-lg border border-white/12 bg-zinc-950/82 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Wand2 className="h-4 w-4 text-amber-300" aria-hidden />
                    Build console
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{planSummary}</p>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/35 p-1 sm:flex">
                  {formats.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setFormat(option);
                        setResult(null);
                        setError(null);
                      }}
                      className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                        format === option ? "bg-amber-300 text-zinc-950" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="border-b border-white/10 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="space-y-4">
                  {isCommander ? (
                    <div>
                      <label htmlFor="commander" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                        Commander
                      </label>
                      <input
                        id="commander"
                        value={commander}
                        onChange={(event) => setCommander(event.target.value)}
                        placeholder="Atraxa, Praetors' Voice"
                        className="mt-2 w-full rounded-md border border-white/10 bg-black/45 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="colors" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                        Colours
                      </label>
                      <input
                        id="colors"
                        value={colors}
                        onChange={(event) => setColors(event.target.value.toUpperCase())}
                        placeholder="WUBRG, UR, BG..."
                        className="mt-2 w-full rounded-md border border-white/10 bg-black/45 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15"
                      />
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
                      className="mt-2 h-32 w-full resize-none rounded-md border border-white/10 bg-black/45 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Power</div>
                      <div className="mt-2 flex flex-wrap gap-1 rounded-md border border-white/10 bg-black/35 p-1">
                        {powers.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setPower(option)}
                            className={`min-h-8 flex-1 rounded px-2 py-1.5 text-xs font-bold transition ${
                              power === option ? "bg-cyan-300 text-zinc-950" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Budget</div>
                      <div className="mt-2 flex flex-wrap gap-1 rounded-md border border-white/10 bg-black/35 p-1">
                        {budgets.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setBudget(option)}
                            className={`min-h-8 flex-1 rounded px-2 py-1.5 text-xs font-bold transition ${
                              budget === option ? "bg-cyan-300 text-zinc-950" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Build shape</div>
                    <div className="mt-2 grid gap-2">
                      {buildModes.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setBuildMode(mode.id)}
                          className={`rounded-md border p-3 text-left transition ${
                            buildMode === mode.id
                              ? "border-amber-300/60 bg-amber-300/12"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-white">{mode.label}</div>
                            <div className="text-xs leading-5 text-zinc-500">{mode.helper}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generateDeck}
                  disabled={busy || !canGenerate}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Zap className="h-4 w-4 animate-pulse" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                  {busy ? "Building deck..." : "Build my deck"}
                </button>

                {error && (
                  <div className="mt-3 flex gap-2 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Deck preview</div>
                    <div className="mt-2 text-2xl font-black text-white">{result?.title || "Ready to build"}</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {result ? `${currentLines} deck lines generated` : "Your first draft appears here."}
                    </div>
                  </div>
                  <div className="grid h-20 w-20 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-300/10">
                    <div className="text-center">
                      <div className="text-xs font-bold text-cyan-100">Format</div>
                      <div className="text-sm font-black text-cyan-200">{format}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    ["Budget", budget],
                    ["Power", power],
                    ["Colours", formatColors(result?.colors || (colors ? colors.split("") : []))],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-3">
                      <div className="text-xs text-zinc-500">{label}</div>
                      <div className="mt-1 truncate text-sm font-black text-zinc-100">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-md border border-white/10 bg-black/35">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-black text-white">
                      <FileText className="h-4 w-4 text-amber-300" aria-hidden />
                      Output
                    </div>
                    {result?.deckText ? (
                      <button
                        type="button"
                        onClick={copyDeck}
                        className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {copied ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </div>
                  <pre className="h-72 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-zinc-300">
                    {result?.deckText ||
                      `Commander\n1 ${commander || "Your Commander"}\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n...\n\nSet the plan on the left, then generate a reviewable first draft.`}
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
                ) : (
                  <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-white">
                      <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden />
                      Next best step
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      After generation, run the list through the checker to catch land count, role balance, and format issues.
                    </p>
                  </div>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={checkGeneratedDeck}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
                  >
                    <Clipboard className="h-4 w-4" aria-hidden />
                    Check this deck
                  </button>
                  <button
                    type="button"
                    onClick={openSignup}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15"
                  >
                    <Save className="h-4 w-4" aria-hidden />
                    Save in ManaTap
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {sampleIdeas.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setIdea(sample);
                setResult(null);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.045] p-4 text-left transition hover:bg-white/[0.07]"
            >
              <Layers3 className="h-5 w-5 text-cyan-300" aria-hidden />
              <h2 className="mt-3 text-base font-black text-white">{sample}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Load this as the deck seed and tune the format, power, and budget above.</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
