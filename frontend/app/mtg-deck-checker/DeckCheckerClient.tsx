"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardPaste,
  Gauge,
  Play,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { AI_WORKSHOP_HANDOFF_KEY, type AiWorkshopHandoff } from "@/lib/deck/ai-workshop-actions";
import { countAiWorkshopDeckCards } from "@/lib/deck/ai-workshop-deck-text";
import { getAiDeckHalfwayMinimumCards } from "@/lib/deck/ai-workshop-rules";
import { prepareDeckCheckerRun } from "@/lib/deck/deck-checker-prep";

type Bands = Partial<Record<"curve" | "ramp" | "draw" | "removal" | "mana", number>>;
type Counts = { lands: number; ramp: number; draw: number; removal: number };
type Suggestion = { card?: string; reason?: string; category?: string };

type BusyPhase = null | "reading" | "identifying" | "analyzing";

const formats: AnalyzeFormat[] = ["Commander", "Modern", "Pioneer", "Standard", "Pauper"];

const sampleCommanderDeck = `Commander
1 Krenko, Mob Boss

Deck
1 Sol Ring
1 Arcane Signet
1 Mind Stone
1 Heraldic Banner
1 Ruby Medallion
1 Skirk Prospector
1 Goblin Warchief
1 Goblin Chieftain
1 Goblin Matron
1 Mogg War Marshal
1 Siege-Gang Commander
1 Krenko's Command
1 Hordeling Outburst
1 Impact Tremors
1 Shared Animosity
1 Goblin Bombardment
1 Lightning Bolt
1 Chaos Warp
1 Abrade
1 Faithless Looting
1 Thrill of Possibility
1 Valakut Awakening
1 Swiftfoot Boots
1 Thousand-Year Elixir
1 Castle Embereth
1 Den of the Bugbear
1 Forgotten Cave
1 Path of Ancestry
1 War Room
30 Mountain`;

const previewBands: Required<Bands> = {
  curve: 0.74,
  ramp: 0.68,
  draw: 0.55,
  removal: 0.61,
  mana: 0.82,
};

const targetByFormat: Record<AnalyzeFormat, Counts> = {
  Commander: { lands: 35, ramp: 8, draw: 8, removal: 5 },
  Modern: { lands: 20, ramp: 0, draw: 4, removal: 8 },
  Pioneer: { lands: 23, ramp: 0, draw: 4, removal: 6 },
  Standard: { lands: 24, ramp: 0, draw: 4, removal: 6 },
  Pauper: { lands: 22, ramp: 0, draw: 4, removal: 7 },
};

const bandLabels: Array<{ key: keyof Required<Bands>; label: string; helper: string }> = [
  { key: "curve", label: "Curve", helper: "Can this deck spend mana on schedule?" },
  { key: "mana", label: "Mana", helper: "Land count and color access" },
  { key: "draw", label: "Draw", helper: "Card flow after the first hand" },
  { key: "ramp", label: "Ramp", helper: "Acceleration into key turns" },
  { key: "removal", label: "Interaction", helper: "Answers for opposing threats" },
];

function gradeForScore(score: number | null) {
  if (score === null) return "B";
  if (score >= 88) return "A";
  if (score >= 78) return "B+";
  if (score >= 64) return "B";
  if (score >= 50) return "C";
  return "D";
}

function verdictForScore(score: number | null) {
  if (score === null) return "Mixed";
  if (score >= 82) return "Strong";
  if (score >= 60) return "Mixed";
  return "Needs work";
}

function percent(value: number | undefined) {
  return Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
}

function lineCount(deckText: string) {
  return deckText.split(/\r?\n/).filter((line) => line.trim() && !/^commander$|^deck$/i.test(line.trim())).length;
}

function buildFixes(format: AnalyzeFormat, counts: Counts | null, quickFixes: string[], suggestions: Suggestion[]) {
  if (quickFixes.length) return quickFixes.slice(0, 4);

  if (!counts) {
    return [
      "Paste a list to check land count, ramp, draw, removal, and curve.",
      "Commander lists should usually start near 35 lands, 8 ramp, and 8 draw pieces.",
      "Constructed lists care more about curve pressure, sideboard shape, and interaction density.",
    ];
  }

  const target = targetByFormat[format];
  const fixes: string[] = [];
  const deficit = (key: keyof Counts) => Math.max(0, target[key] - counts[key]);

  if (deficit("lands") > 0) fixes.push(`Add ${deficit("lands")} land${deficit("lands") === 1 ? "" : "s"} before adding flashier spells.`);
  if (target.ramp > 0 && deficit("ramp") > 0) fixes.push(`Add ${deficit("ramp")} ramp piece${deficit("ramp") === 1 ? "" : "s"} so key turns happen on time.`);
  if (deficit("draw") > 0) fixes.push(`Add ${deficit("draw")} draw source${deficit("draw") === 1 ? "" : "s"} to avoid running out of cards.`);
  if (deficit("removal") > 0) fixes.push(`Add ${deficit("removal")} interaction spell${deficit("removal") === 1 ? "" : "s"} for opposing threats.`);

  const suggestedCards = suggestions
    .map((suggestion) => suggestion.card)
    .filter((card): card is string => Boolean(card))
    .slice(0, 2);

  if (suggestedCards.length) fixes.push(`Review upgrade candidates: ${suggestedCards.join(", ")}.`);
  if (!fixes.length) fixes.push("Core counts look stable. Tune now for matchup pressure, synergy density, and budget.");

  return fixes.slice(0, 4);
}

function busyLabel(phase: BusyPhase) {
  if (phase === "reading") return "Reading decklist...";
  if (phase === "identifying") return "Identifying cards & format...";
  if (phase === "analyzing") return "Running deck check...";
  return "Run deck check";
}

export default function DeckCheckerClient() {
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<AnalyzeFormat>("Commander");
  const [commander, setCommander] = useState("");
  const [busyPhase, setBusyPhase] = useState<BusyPhase>(null);
  const [prepSummary, setPrepSummary] = useState<string | null>(null);
  const [needsCommanderConfirm, setNeedsCommanderConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [bands, setBands] = useState<Bands | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [quickFixes, setQuickFixes] = useState<string[]>([]);
  const [whatsGood, setWhatsGood] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const busy = busyPhase !== null;
  const activeBands = bands ?? previewBands;
  const fixes = useMemo(() => buildFixes(format, counts, quickFixes, suggestions), [counts, format, quickFixes, suggestions]);
  const hasResult = score !== null || counts !== null;
  const currentScore = score ?? 72;
  const deckLines = lineCount(deckText);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("manatap_deck_checker_prefill");
      if (!raw) return;
      sessionStorage.removeItem("manatap_deck_checker_prefill");
      const parsed = JSON.parse(raw) as { deckText?: string; format?: AnalyzeFormat };
      if (parsed.deckText?.trim()) {
        setDeckText(parsed.deckText);
        if (formats.includes(parsed.format as AnalyzeFormat)) setFormat(parsed.format as AnalyzeFormat);
      }
    } catch {
      // Best-effort handoff from the deck builder.
    }
  }, []);

  async function runAnalysis(
    nextDeckText = deckText,
    nextFormat = format,
    nextCommander = commander,
    skipCommanderGate = false,
  ) {
    if (!nextDeckText.trim()) {
      setError("Paste a decklist first, or load the sample Commander list.");
      return;
    }

    try {
      setError(null);
      setNeedsCommanderConfirm(false);
      setBusyPhase("reading");

      const prep = prepareDeckCheckerRun(nextDeckText.trim(), nextFormat);
      const resolvedFormat = prep.detectedFormat;
      const resolvedCommander = nextCommander.trim() || prep.commander || "";
      setPrepSummary(prep.formatHint);

      if (resolvedFormat !== nextFormat) {
        setFormat(resolvedFormat);
      }
      if (prep.commander && !nextCommander.trim()) {
        setCommander(prep.commander);
      }

      if (
        !skipCommanderGate &&
        resolvedFormat === "Commander" &&
        !resolvedCommander
      ) {
        setNeedsCommanderConfirm(true);
        setBusyPhase(null);
        setError("Commander format needs a commander. Confirm who leads this deck below.");
        return;
      }

      setBusyPhase("identifying");
      let preparedDeckText = nextDeckText.trim();
      try {
        const fixRes = await fetch("/api/deck/parse-and-fix-names", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckText: preparedDeckText }),
        });
        const fixData = await fixRes.json().catch(() => ({}));
        if (fixRes.ok && fixData?.ok && Array.isArray(fixData.cards) && fixData.cards.length) {
          preparedDeckText = fixData.cards
            .map((card: { qty?: number; name?: string }) => `${card.qty ?? 1} ${card.name ?? ""}`.trim())
            .filter((line: string) => line.length > 1)
            .join("\n");
          if (preparedDeckText !== nextDeckText.trim()) {
            setDeckText(preparedDeckText);
          }
        }
      } catch {
        // Name fixing is best-effort before the heavy analyze call.
      }

      setBusyPhase("analyzing");

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 240000);
      // eslint-disable-next-line no-restricted-globals
      const res = await fetch("/api/deck/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckText: preparedDeckText,
          format: resolvedFormat,
          commander: resolvedFormat === "Commander" ? resolvedCommander : undefined,
          useScryfall: true,
          sourcePage: "mtg_deck_checker_landing",
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || res.statusText);

      setScore(typeof data?.score === "number" ? data.score : null);
      setBands(data?.bands ?? null);
      setCounts(data?.counts ?? null);
      setQuickFixes(Array.isArray(data?.quickFixes) ? data.quickFixes : []);
      setWhatsGood(Array.isArray(data?.whatsGood) ? data.whatsGood : []);
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 5) : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analysis failed.";
      setError(err instanceof Error && err.name === "AbortError" ? "Analysis timed out. Try a shorter list or run it again." : message);
      setScore(null);
      setBands(null);
      setCounts(null);
      setQuickFixes([]);
      setWhatsGood([]);
      setSuggestions([]);
    } finally {
      setBusyPhase(null);
    }
  }

  function loadSample() {
    setFormat("Commander");
    setDeckText(sampleCommanderDeck);
    setCommander("Krenko, Mob Boss");
    setError(null);
    setPrepSummary(null);
    void runAnalysis(sampleCommanderDeck, "Commander", "Krenko, Mob Boss", true);
  }

  return (
    <section className="relative overflow-hidden bg-[#050608] text-white">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(103,232,249,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,0.4)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="relative mx-auto flex min-h-[calc(100vh-82px)] max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Free MTG deck analyzer
            </div>
            <h1 className="max-w-xl text-4xl font-black leading-[0.95] tracking-normal text-white sm:text-5xl lg:text-6xl">
              MTG Deck Checker
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
              Paste a decklist. Catch legality, curve, mana, ramp, draw, and interaction problems before game night.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="#checker"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-black text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.22)] transition hover:bg-amber-200"
              >
                <ClipboardPaste className="h-4 w-4" aria-hidden />
                Check my deck
              </a>
              <button
                type="button"
                onClick={loadSample}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
              >
                <Play className="h-4 w-4" aria-hidden />
                Try sample Commander deck
              </button>
            </div>

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-2 text-sm">
              {[
                ["Formats", "5"],
                ["Signup", "No"],
                ["Result", "Detailed"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-3">
                  <div className="text-xs uppercase text-zinc-500">{label}</div>
                  <div className="mt-1 font-black text-zinc-100">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div id="checker" className="rounded-lg border border-white/12 bg-zinc-950/82 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Gauge className="h-4 w-4 text-amber-300" aria-hidden />
                    Deck check console
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {prepSummary || (deckLines ? `${deckLines} deck lines loaded` : "Ready for your decklist")}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/35 p-1 sm:flex">
                  {formats.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFormat(option)}
                      className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                        format === option ? "bg-cyan-300 text-zinc-950" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[1.03fr_0.97fr]">
              <div className="border-b border-white/10 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <label htmlFor="decklist" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                  Decklist
                </label>
                <textarea
                  id="decklist"
                  value={deckText}
                  onChange={(event) => {
                    setDeckText(event.target.value);
                    setError(null);
                    setPrepSummary(null);
                    setNeedsCommanderConfirm(false);
                  }}
                  placeholder={`1 Sol Ring\n1 Arcane Signet\n1 Swords to Plowshares\n1 Command Tower`}
                  className="mt-3 h-80 w-full resize-none rounded-md border border-white/10 bg-black/45 px-4 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15"
                />
                <button
                  type="button"
                  onClick={() => runAnalysis()}
                  disabled={busy || !deckText.trim()}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Zap className="h-4 w-4 animate-pulse" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                  {busyLabel(busyPhase)}
                </button>
                {needsCommanderConfirm && (
                  <div className="mt-3 rounded-md border border-amber-300/35 bg-amber-950/25 p-3">
                    <label htmlFor="commander-name" className="text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
                      Commander name
                    </label>
                    <input
                      id="commander-name"
                      value={commander}
                      onChange={(event) => setCommander(event.target.value)}
                      placeholder="e.g. Krenko, Mob Boss"
                      className="mt-2 w-full rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-300/60"
                    />
                    <button
                      type="button"
                      onClick={() => void runAnalysis(deckText, format, commander, true)}
                      disabled={!commander.trim() || busy}
                      className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-amber-300 px-4 py-2 text-sm font-black text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm commander & run check
                    </button>
                  </div>
                )}
                {busyPhase && (
                  <p className="mt-2 text-xs text-cyan-200/80">
                    {busyPhase === "reading"
                      ? "Parsing your list and detecting format..."
                      : busyPhase === "identifying"
                        ? "Matching card names before the full check..."
                        : "Scoring curve, mana, roles, and legality — large lists can take a minute."}
                  </p>
                )}
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
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Deck verdict</div>
                    <div className="mt-2 text-2xl font-black text-white">{verdictForScore(score)}</div>
                    <div className="mt-1 text-sm text-zinc-400">{hasResult ? "Based on this decklist" : "Preview until you run a check"}</div>
                  </div>
                  <div className="grid h-20 w-20 place-items-center rounded-lg border border-amber-300/35 bg-amber-300/10">
                    <div className="text-center">
                      <div className="text-xs font-bold text-amber-100">Grade</div>
                      <div className="text-3xl font-black text-amber-200">{gradeForScore(score)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    ["Score", String(currentScore)],
                    ["Issues", String(fixes.length)],
                    ["Signals", String(whatsGood.length + suggestions.length || 6)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-3">
                      <div className="text-xs text-zinc-500">{label}</div>
                      <div className="mt-1 text-xl font-black text-zinc-100">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {bandLabels.map((band) => {
                    const pct = percent(activeBands[band.key]);
                    return (
                      <div key={band.key}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="font-bold text-zinc-200" title={band.helper}>{band.label}</span>
                          <span className="font-mono text-zinc-500">{pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-amber-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden />
                    Top fixes
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-300">
                    {fixes.map((fix) => (
                      <li key={fix} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-300" />
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {countAiWorkshopDeckCards(deckText, format) >= getAiDeckHalfwayMinimumCards(format) ? (
                    <Link
                      href="/ai-workshop"
                      onClick={() => {
                        try {
                          const handoff: AiWorkshopHandoff = {
                            deckText: deckText.trim(),
                            format,
                            sourceLabel: "Deck Checker",
                          };
                          sessionStorage.setItem(AI_WORKSHOP_HANDOFF_KEY, JSON.stringify(handoff));
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-500/25"
                    >
                      Refine in AI Workshop
                    </Link>
                  ) : null}
                  <Link
                    href="/my-decks"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15"
                  >
                    Save deck for full AI analysis
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-4">
          {[
            { icon: ShieldCheck, title: "Legality", copy: "Format rules, commander identity, and copy-count problems." },
            { icon: BarChart3, title: "Mana curve", copy: "See whether the list actually spends mana on time." },
            { icon: Gauge, title: "Role balance", copy: "Lands, ramp, draw, removal, and threat density at a glance." },
            { icon: Wand2, title: "Upgrade ideas", copy: "Concrete fixes before you spend money on the wrong cards." },
          ].map((feature) => (
            <div key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
              <feature.icon className="h-5 w-5 text-cyan-300" aria-hidden />
              <h2 className="mt-3 text-base font-black text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{feature.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
