'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FolderPlus,
  GitCompare,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import CardDetailLink from '@/components/cards/CardDetailLink';
import { normalizeCurrency, usePrefs, type CurrencyPref } from '@/components/PrefsContext';
import ProFeatureCard from '@/components/ProFeatureCard';
import { renderMarkdown } from '@/lib/chat/markdownRenderer';
import { mainDeckTextCardCount } from '@/lib/deck/formatCompliance';
import { FORMAT_LABEL, normalizeDeckFormat, type DeckFormatCanonical } from '@/lib/deck/formatRules';

type Deck = {
  id: string;
  title: string | null;
  commander: string | null;
  format?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CompareInputDeck =
  | { type: 'saved' | 'public'; deckId: string }
  | { type: 'pasted'; title?: string; deckText: string; format: string; commander?: string | null };

type CompareDeckSource = 'saved' | 'public' | 'pasted';

type CompareDeckDraft = {
  id: string;
  source: CompareDeckSource;
  title: string;
  commander: string | null;
  format: string;
  cardCount: number | null;
  input: CompareInputDeck;
};

type CompareV2Deck = {
  id: string;
  source: 'own_saved' | 'own_pasted' | 'public_scan';
  title: string;
  commander: string | null;
  format: string;
  cardCount: number;
  estimatedValueUsd: number | null;
  topExpensiveCards: Array<{ name: string; estimatedPriceUsd: number }>;
  power: { deterministicScore: number; aiAdjustedScore: number; level: number; band: 'casual' | 'focused' | 'high' | 'competitive' };
  stats: { tempo: number; consistency: number; interaction: number; resilience: number; closing: number; mana: number; synergy: number };
  strengths: string[];
  weaknesses: string[];
  summary: string;
  tableRole?: string;
  whyItWins?: string;
  watchOutFor?: string[];
  swingCards?: string[];
  absolutePowerLevel?: number;
  podRank?: number | null;
  podRelativePower?: 'top' | 'upper' | 'middle' | 'lower' | 'bottom';
};

type CompareV2Success = {
  ok: true;
  format: string;
  decks: CompareV2Deck[];
  overview: {
    strongestDeckId: string | null;
    weakestDeckId: string | null;
    fastestDeckId: string | null;
    bestLongGameDeckId: string | null;
    verdict: string;
    bullets: string[];
    winnerReason?: string;
    podBalance?: 'balanced' | 'slightly_mismatched' | 'mismatched';
    podBalanceNote?: string;
    pairwiseMatchups?: Array<{ deckAId: string; deckBId: string; favoredDeckId: string | null; confidence: number; note: string }>;
  };
  meta: { version: number; model: string; usedAi: boolean; generated_at: string; deepAi?: boolean };
  aiMatchup?: {
    summary: {
      better_for_fast_tables: string;
      better_for_slower_pods: string;
      more_consistent: string;
      highest_ceiling: string;
      one_line_verdict: string;
    };
    sections: {
      key_differences: string[];
      strategy: string[];
      strengths_weaknesses: string[];
      recommended_scenarios: string[];
    };
    full_analysis: {
      key_differences: string;
      strategy: string;
      strengths_and_weaknesses: string;
      recommendations: string;
      best_in_different_scenarios: string;
    };
    ui: {
      verdict_cards: Array<{ label: string; winnerDeckId: string | null; winner: string }>;
      deck_strengths: Record<string, string[]>;
      scenario_cards: Array<{ label: string; winnerDeckId: string | null; winner: string; reason: string }>;
      rating_reasons?: Array<{ deckId: string; summary: string; drivers: string[]; confidence: 'low' | 'medium' | 'high' }>;
      game_pattern?: {
        early: { favoredDeckId: string | null; winner: string; reason: string };
        mid: { favoredDeckId: string | null; winner: string; reason: string };
        late: { favoredDeckId: string | null; winner: string; reason: string };
      };
      key_swing_cards?: Array<{ deckId: string; cards: string[]; why: string }>;
      upset_paths?: Array<{ deckId: string; targetDeckId: string | null; path: string; keyCards: string[] }>;
      confidence_label?: 'close' | 'favored' | 'dominant';
      deep_report?: {
        headline?: string;
        table_plan?: string;
        highlighted_cards?: Array<{ deckId: string; cards: string[]; why: string }>;
        combos?: Array<{ deckId: string; cards: string[]; line: string; vulnerability?: string }>;
        synergy?: Array<{ deckId: string; engine: string; cards: string[]; payoff: string }>;
        tactics?: Array<{ deckId: string; advice: string; timing?: string; keyCards?: string[] }>;
        threat_assessment?: Array<{ deckId: string; threat: string; answer?: string; priority?: 'low' | 'medium' | 'high' }>;
      };
    };
  };
};

type CompareV2Result = CompareV2Success | { ok: false; error: string; code?: string };
type ResultTab = 'overview' | 'decks' | 'matchups' | 'table' | 'ai';

const MAX_DECKS = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMAT_OPTIONS: DeckFormatCanonical[] = ['commander', 'modern', 'pioneer', 'standard', 'pauper'];
const DECK_ACCENTS = ['#f87171', '#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb7185'];
const USD_TO: Record<CurrencyPref, number> = { USD: 1, EUR: 0.92, GBP: 0.78 };

function formatLabel(format: string | null | undefined): string {
  const normalized = normalizeDeckFormat(format);
  return normalized ? FORMAT_LABEL[normalized] : String(format || 'Commander');
}

function formatKey(format: string | null | undefined): DeckFormatCanonical | null {
  return normalizeDeckFormat(format);
}

function deckAccent(decks: Array<{ id: string }>, deckId?: string | null): string {
  const index = decks.findIndex((deck) => deck.id === deckId);
  return DECK_ACCENTS[index >= 0 ? index % DECK_ACCENTS.length : 0];
}

function minCardsForFormat(format: string): number {
  return formatKey(format) === 'commander' ? 50 : 30;
}

function formatMoneyFromUsd(valueUsd: number | null | undefined, currency: CurrencyPref): string {
  if (valueUsd == null || !Number.isFinite(valueUsd)) return 'Unknown';
  const converted = valueUsd * USD_TO[currency];
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(converted);
}

function extractPublicDeckId(raw: string): string | null {
  const value = raw.trim();
  if (UUID_RE.test(value)) return value;
  const match = value.match(/\/decks\/([0-9a-f-]{36})(?:[/?#]|$)/i) || value.match(/[?&]deckId=([0-9a-f-]{36})(?:&|$)/i);
  const candidate = match?.[1] ?? null;
  return candidate && UUID_RE.test(candidate) ? candidate : null;
}

function deckTextCardCount(deckText: string, format: string): number {
  return mainDeckTextCardCount(deckText, formatLabel(format));
}

function extractCommanderGuess(deckText: string): string | null {
  const lines = deckText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commanderHeader = lines.find((line) => /^commander\s*[:\-]/i.test(line));
  if (commanderHeader) return commanderHeader.replace(/^commander\s*[:\-]\s*/i, '').replace(/^\d+\s*x?\s*/i, '').trim() || null;
  const lastLine = lines[lines.length - 1] ?? '';
  if (/^1\s+/.test(lastLine)) return lastLine.replace(/^1\s+/, '').trim() || null;
  return null;
}

function compareErrorMessage(code: string | undefined, fallback: string): string {
  if (code === 'COMMANDER_REQUIRED') return 'Pick the commander for every pasted Commander deck before comparing.';
  if (code === 'FORMAT_MISMATCH') return fallback || 'All compared decks must use the same format.';
  if (code === 'DECK_TOO_LARGE') return fallback || 'One pasted deck is too large for that format.';
  if (code === 'DECK_TOO_SMALL') return fallback || 'One deck needs more cards before comparison.';
  if (code === 'PRO_REQUIRED') return 'Deep AI analysis is a Pro feature.';
  return fallback || 'Compare failed. Please try again.';
}

function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {renderMarkdown(text, {
        renderCard: (cardName) => (
          <CardDetailLink cardName={cardName} className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
            {cardName}
          </CardDetailLink>
        ),
      })}
    </div>
  );
}

async function runCompareV2(decks: CompareInputDeck[]): Promise<CompareV2Result> {
  const res = await fetch('/api/mobile/deck/compare-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ decks, sourcePage: 'website_deck_compare_v2' }),
  });
  const json = (await res.json().catch(() => ({}))) as CompareV2Result;
  if (!res.ok || !json.ok) {
    return { ok: false, error: compareErrorMessage('code' in json ? json.code : undefined, 'error' in json ? json.error : `Request failed (${res.status})`), code: 'code' in json ? json.code : undefined };
  }
  return json;
}

async function runDeepAi(comparison: CompareV2Success): Promise<CompareV2Result> {
  const res = await fetch('/api/mobile/deck/compare-v2/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ comparison, sourcePage: 'website_deck_compare_v2_ai' }),
  });
  const json = (await res.json().catch(() => ({}))) as CompareV2Result;
  if (!res.ok || !json.ok) {
    return { ok: false, error: compareErrorMessage('code' in json ? json.code : undefined, 'error' in json ? json.error : `Request failed (${res.status})`), code: 'code' in json ? json.code : undefined };
  }
  return json;
}

function PodSnapshot({ result }: { result: CompareV2Success }) {
  const byId = new Map(result.decks.map((deck) => [deck.id, deck]));
  const strongest = result.overview.strongestDeckId ? byId.get(result.overview.strongestDeckId) : null;
  const weakest = result.overview.weakestDeckId ? byId.get(result.overview.weakestDeckId) : null;
  return (
    <div className="rounded-2xl border border-sky-300/15 bg-neutral-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-neutral-400">{result.decks.length} {result.format} decks</span>
        {result.aiMatchup?.ui.confidence_label ? (
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
            {result.aiMatchup.ui.confidence_label === 'dominant' ? 'Dominant edge' : result.aiMatchup.ui.confidence_label === 'close' ? 'Close table' : 'Favored, beatable'}
          </span>
        ) : null}
      </div>
      <MarkdownText text={result.overview.verdict} className="text-sm leading-6 text-neutral-200" />
      <div className="mt-3 flex flex-wrap gap-2">
        {strongest ? <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: deckAccent(result.decks, strongest.id), color: deckAccent(result.decks, strongest.id) }}>Top: {strongest.title}</span> : null}
        {weakest ? <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: deckAccent(result.decks, weakest.id), color: deckAccent(result.decks, weakest.id) }}>Lowest: {weakest.title}</span> : null}
      </div>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="grid grid-cols-[88px_1fr_32px] items-center gap-2 text-xs">
      <span className="font-semibold text-neutral-400">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right font-bold text-neutral-300">{pct}</span>
    </div>
  );
}

function ResultDeckCard({ deck, accent, currency }: { deck: CompareV2Deck; accent: string; currency: CurrencyPref }) {
  return (
    <div className="rounded-2xl border bg-neutral-950/80 p-5" style={{ borderColor: `${accent}80` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black" style={{ color: accent }}>{deck.title}</h3>
          <p className="mt-1 text-xs text-neutral-400">{deck.format} · {deck.cardCount} cards{deck.commander ? ` · ${deck.commander}` : ''}</p>
        </div>
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border border-amber-300/35 bg-amber-300/10">
          <span className="text-xl font-black text-amber-200">{deck.power.level}</span>
          <span className="text-[9px] font-black uppercase text-neutral-400">/10</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-bold text-amber-200">{formatMoneyFromUsd(deck.estimatedValueUsd, currency)} estimated</p>
      <div className="mt-3 space-y-2">
        <StatBar label="Speed" value={deck.stats.tempo} />
        <StatBar label="Interaction" value={deck.stats.interaction} />
        <StatBar label="Consistency" value={deck.stats.consistency} />
        <StatBar label="Synergy" value={deck.stats.synergy} />
      </div>
      {deck.summary ? <MarkdownText text={deck.summary} className="mt-4 text-sm leading-6 text-neutral-300" /> : null}
      {deck.topExpensiveCards.length ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-black uppercase text-neutral-500">Most expensive</div>
          <div className="flex flex-wrap gap-2">
            {deck.topExpensiveCards.slice(0, 5).map((card) => (
              <span key={card.name} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300">
                <CardDetailLink cardName={card.name} className="text-sky-300 underline underline-offset-2 hover:text-sky-200">{card.name}</CardDetailLink>
                <span className="ml-1 text-neutral-500">{formatMoneyFromUsd(card.estimatedPriceUsd, currency)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeepDeckTabbedRows<T extends { deckId: string }>({
  title,
  rows,
  result,
  render,
}: {
  title: string;
  rows: T[] | undefined;
  result: CompareV2Success;
  render: (row: T) => React.ReactNode;
}) {
  const safeRows = (rows ?? []).filter((row) => result.decks.some((deck) => deck.id === row.deckId));
  const [activeId, setActiveId] = useState<string | null>(safeRows[0]?.deckId ?? null);
  if (!safeRows.length) return null;
  const selected = safeRows.find((row) => row.deckId === activeId) ?? safeRows[0];
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <h3 className="mb-3 text-center text-lg font-black text-white">{title}</h3>
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {safeRows.map((row) => {
          const deck = result.decks.find((item) => item.id === row.deckId);
          const accent = deckAccent(result.decks, row.deckId);
          const active = selected.deckId === row.deckId;
          return (
            <button
              key={row.deckId}
              type="button"
              onClick={() => setActiveId(row.deckId)}
              className="max-w-[190px] rounded-full border px-3 py-1.5 text-xs font-bold transition"
              style={{ borderColor: accent, color: accent, background: active ? `${accent}22` : `${accent}10` }}
            >
              <span className="block truncate">{deck?.title ?? 'Deck'}</span>
            </button>
          );
        })}
      </div>
      {render(selected)}
    </section>
  );
}

function ResultsView({
  result,
  isPro,
  currency,
  onGenerateDeepAi,
  deepAiLoading,
  deepAiError,
}: {
  result: CompareV2Success;
  isPro: boolean;
  currency: CurrencyPref;
  onGenerateDeepAi: () => void;
  deepAiLoading: boolean;
  deepAiError: string | null;
}) {
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(result.overview.strongestDeckId ?? result.decks[0]?.id ?? null);
  const deckById = useMemo(() => new Map(result.decks.map((deck) => [deck.id, deck])), [result.decks]);
  const selectedDeck = selectedDeckId ? deckById.get(selectedDeckId) ?? result.decks[0] : result.decks[0];
  const filteredMatchups = useMemo(() => {
    const rows = result.overview.pairwiseMatchups ?? [];
    if (!selectedDeck?.id) return rows;
    return rows.filter((row) => row.deckAId === selectedDeck.id || row.deckBId === selectedDeck.id);
  }, [result.overview.pairwiseMatchups, selectedDeck?.id]);
  const deep = result.aiMatchup?.ui.deep_report;

  const tabs: Array<{ key: ResultTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'decks', label: 'Decks' },
    { key: 'matchups', label: 'Matchups' },
    { key: 'table', label: 'Table Read' },
    { key: 'ai', label: 'AI ✨' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-neutral-950/80 p-2 md:grid-cols-5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-3 py-2 text-sm font-black transition ${activeTab === tab.key ? 'bg-amber-300 text-black' : 'bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab !== 'overview' ? <PodSnapshot result={result} /> : null}

      {activeTab === 'overview' ? (
        <section className="rounded-2xl border border-amber-300/15 bg-neutral-950/80 p-5">
          <h2 className="mb-4 text-center text-2xl font-black">Overview</h2>
          <MarkdownText text={result.overview.verdict} className="text-base leading-7 text-neutral-200" />
          {result.overview.winnerReason ? (
            <>
              <h3 className="mt-5 text-center text-lg font-black text-amber-200">Why the top deck leads</h3>
              <MarkdownText text={result.overview.winnerReason} className="mt-2 text-sm leading-6 text-neutral-300" />
            </>
          ) : null}
          {result.overview.podBalanceNote ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-1 text-sm font-black text-white">Pod balance</div>
              <MarkdownText text={result.overview.podBalanceNote} className="text-sm leading-6 text-neutral-300" />
            </div>
          ) : null}
          {result.overview.bullets.length ? (
            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {result.overview.bullets.map((bullet, index) => (
                <MarkdownText key={`${bullet}-${index}`} text={bullet} className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-neutral-300" />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'decks' ? (
        <section className="space-y-4">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {result.decks.map((deck) => {
              const accent = deckAccent(result.decks, deck.id);
              const active = selectedDeck?.id === deck.id;
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => setSelectedDeckId(deck.id)}
                  className="min-w-[230px] rounded-2xl border bg-neutral-950/80 p-4 text-left transition"
                  style={{ borderColor: active ? accent : 'rgba(255,255,255,0.1)' }}
                >
                  <div className="truncate text-sm font-black" style={{ color: accent }}>{deck.title}</div>
                  <div className="mt-1 text-xs text-neutral-500">{deck.power.level}/10 · {formatMoneyFromUsd(deck.estimatedValueUsd, currency)}</div>
                </button>
              );
            })}
          </div>
          {selectedDeck ? <ResultDeckCard deck={selectedDeck} accent={deckAccent(result.decks, selectedDeck.id)} currency={currency} /> : null}
          {result.aiMatchup?.ui.rating_reasons?.length ? (
            <DeepDeckTabbedRows
              title="Why ratings?"
              rows={result.aiMatchup.ui.rating_reasons}
              result={result}
              render={(row) => (
                <div className="space-y-3">
                  <MarkdownText text={row.summary} className="text-sm leading-6 text-neutral-300" />
                  <div className="flex flex-wrap gap-2">{row.drivers.map((driver) => <span key={driver} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-neutral-300">{driver}</span>)}</div>
                </div>
              )}
            />
          ) : null}
        </section>
      ) : null}

      {activeTab === 'matchups' ? (
        <section className="rounded-2xl border border-white/10 bg-neutral-950/80 p-5">
          <h2 className="mb-4 text-center text-2xl font-black">Matchups</h2>
          <div className="mb-4">
            <div className="mb-2 text-center text-xs font-black uppercase tracking-[0.2em] text-neutral-500">Showing matchups for</div>
            <div className="flex flex-wrap justify-center gap-2">
              {result.decks.map((deck) => {
                const accent = deckAccent(result.decks, deck.id);
                const active = selectedDeck?.id === deck.id;
                return (
                  <button key={deck.id} type="button" onClick={() => setSelectedDeckId(deck.id)} className="max-w-[210px] rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: accent, color: accent, background: active ? `${accent}24` : `${accent}10` }}>
                    <span className="block truncate">{deck.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3">
            {filteredMatchups.map((row) => {
              const a = deckById.get(row.deckAId);
              const b = deckById.get(row.deckBId);
              const favored = row.favoredDeckId ? deckById.get(row.favoredDeckId) : null;
              if (!a || !b) return null;
              return (
                <div key={`${row.deckAId}-${row.deckBId}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="text-sm font-black">
                    <span style={{ color: deckAccent(result.decks, a.id) }}>{a.title}</span>
                    <span className="text-neutral-500"> vs </span>
                    <span style={{ color: deckAccent(result.decks, b.id) }}>{b.title}</span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-amber-200">{favored ? `${favored.title} favored · ${row.confidence}%` : `Close pairing · ${row.confidence}%`}</div>
                  <MarkdownText text={row.note} className="mt-2 text-sm leading-6 text-neutral-300" />
                </div>
              );
            })}
          </div>
          {!filteredMatchups.length ? <p className="text-center text-sm text-neutral-500">No matchup rows include this deck.</p> : null}
        </section>
      ) : null}

      {activeTab === 'table' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-neutral-950/80 p-5">
          <h2 className="text-center text-2xl font-black">Table Read</h2>
          {result.aiMatchup?.ui.game_pattern ? (
            <div className="grid gap-3 md:grid-cols-3">
              {(['early', 'mid', 'late'] as const).map((phase) => {
                const pattern = result.aiMatchup!.ui.game_pattern![phase];
                return (
                  <div key={phase} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="text-xs font-black uppercase text-neutral-500">{phase} game</div>
                    <div className="mt-1 text-sm font-black text-amber-200">{pattern.winner}</div>
                    <MarkdownText text={pattern.reason} className="mt-2 text-sm leading-6 text-neutral-300" />
                  </div>
                );
              })}
            </div>
          ) : null}
          {result.aiMatchup?.ui.key_swing_cards?.length ? (
            <DeepDeckTabbedRows
              title="Swing cards"
              rows={result.aiMatchup.ui.key_swing_cards}
              result={result}
              render={(row) => (
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">{row.cards.map((card) => <CardDetailLink key={card} cardName={card} className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-bold text-sky-200 underline">{card}</CardDetailLink>)}</div>
                  <MarkdownText text={row.why} className="text-sm leading-6 text-neutral-300" />
                </div>
              )}
            />
          ) : null}
          {result.aiMatchup?.ui.upset_paths?.length ? (
            <DeepDeckTabbedRows
              title="Upset paths"
              rows={result.aiMatchup.ui.upset_paths}
              result={result}
              render={(row) => (
                <div>
                  <MarkdownText text={row.path} className="text-sm leading-6 text-neutral-300" />
                  {row.keyCards.length ? <div className="mt-2 flex flex-wrap gap-2">{row.keyCards.map((card) => <CardDetailLink key={card} cardName={card} className="text-sky-300 underline hover:text-sky-200">{card}</CardDetailLink>)}</div> : null}
                </div>
              )}
            />
          ) : null}
          {result.aiMatchup?.ui.scenario_cards?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {result.aiMatchup.ui.scenario_cards.map((card, index) => (
                <div key={`${card.label}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="text-xs font-black uppercase text-neutral-500">{card.label}</div>
                  <div className="mt-1 text-sm font-black text-amber-200">{card.winner}</div>
                  <MarkdownText text={card.reason} className="mt-2 text-sm leading-6 text-neutral-300" />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'ai' ? (
        <section className="space-y-4 rounded-2xl border border-fuchsia-300/15 bg-neutral-950/80 p-5">
          <h2 className="text-center text-2xl font-black">AI ✨</h2>
          {!isPro ? (
            <>
              <ProFeatureCard
                feature="deck_compare_deep_ai"
                location="website_deck_compare"
                title="Unlock deeper matchup coaching"
                description="Generate highlighted cards, conversion lines, synergy engines, tactics, threat priorities, and upset paths for the full pod."
                cta="Upgrade to Pro"
              />
              <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-4">
                <div className="mb-2 text-sm font-black text-fuchsia-200">Example Pro read</div>
                <p className="text-sm leading-6 text-neutral-300">The strongest deck sets the pace, but the second deck can flip the table if it protects interaction for the first payoff turn. Pro calls out exact cards, timing windows, pressure points, and who should answer what.</p>
              </div>
            </>
          ) : !result.meta.deepAi ? (
            <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-5 text-center">
              <p className="mx-auto max-w-2xl text-sm leading-6 text-neutral-300">Generate a slower, more opinionated Pro analysis with highlighted cards, combos/conversion lines, synergy engines, tactics, and threat priorities.</p>
              <button type="button" onClick={onGenerateDeepAi} disabled={deepAiLoading} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-sky-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                {deepAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {deepAiLoading ? 'Generating...' : 'Generate AI analysis'}
              </button>
              {deepAiError ? <p className="mt-3 text-sm text-red-300">{deepAiError}</p> : null}
            </div>
          ) : deep ? (
            <>
              {deep.headline ? <MarkdownText text={deep.headline} className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-4 text-base font-bold leading-7 text-fuchsia-50" /> : null}
              {deep.table_plan ? <MarkdownText text={deep.table_plan} className="text-sm leading-6 text-neutral-300" /> : null}
              <DeepDeckTabbedRows title="Highlighted cards" rows={deep.highlighted_cards} result={result} render={(row) => <div><div className="mb-2 flex flex-wrap gap-2">{row.cards.map((card) => <CardDetailLink key={card} cardName={card} className="text-sky-300 underline hover:text-sky-200">{card}</CardDetailLink>)}</div><MarkdownText text={row.why} className="text-sm leading-6 text-neutral-300" /></div>} />
              <DeepDeckTabbedRows title="Combos and conversion lines" rows={deep.combos} result={result} render={(row) => <div><div className="mb-2 flex flex-wrap gap-2">{row.cards.map((card) => <CardDetailLink key={card} cardName={card} className="text-sky-300 underline hover:text-sky-200">{card}</CardDetailLink>)}</div><MarkdownText text={`${row.line}${row.vulnerability ? `\n\nVulnerability: ${row.vulnerability}` : ''}`} className="text-sm leading-6 text-neutral-300" /></div>} />
              <DeepDeckTabbedRows title="Synergy engines" rows={deep.synergy} result={result} render={(row) => <div><div className="text-sm font-black text-amber-200">{row.engine}</div><div className="my-2 flex flex-wrap gap-2">{row.cards.map((card) => <CardDetailLink key={card} cardName={card} className="text-sky-300 underline hover:text-sky-200">{card}</CardDetailLink>)}</div><MarkdownText text={row.payoff} className="text-sm leading-6 text-neutral-300" /></div>} />
              <DeepDeckTabbedRows title="Tactics" rows={deep.tactics} result={result} render={(row) => <MarkdownText text={`${row.timing ? `${row.timing}: ` : ''}${row.advice}${row.keyCards?.length ? `\n\n${row.keyCards.map((card) => `[[${card}]]`).join(', ')}` : ''}`} className="text-sm leading-6 text-neutral-300" />} />
              <DeepDeckTabbedRows title="Threat priorities" rows={deep.threat_assessment} result={result} render={(row) => <MarkdownText text={`${row.priority ? `${row.priority.toUpperCase()} priority. ` : ''}${row.threat}${row.answer ? `\n\nAnswer: ${row.answer}` : ''}`} className="text-sm leading-6 text-neutral-300" />} />
            </>
          ) : (
            <p className="text-center text-sm text-neutral-400">No deep report was returned.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default function DeckComparisonTool({ decks }: { decks: Deck[] }) {
  const searchParams = useSearchParams();
  const { isPro } = useProStatusSafe();
  const { currency: prefCurrency } = usePrefs();
  const currency = normalizeCurrency(prefCurrency) || 'USD';
  const [compareDecks, setCompareDecks] = useState<CompareDeckDraft[]>([]);
  const [savedSearch, setSavedSearch] = useState('');
  const [savedOpen, setSavedOpen] = useState(false);
  const [publicInput, setPublicInput] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteFormat, setPasteFormat] = useState<DeckFormatCanonical>('commander');
  const [pasteCommander, setPasteCommander] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [deepAiLoading, setDeepAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deepAiError, setDeepAiError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareV2Success | null>(null);

  const lockedFormat = useMemo(() => compareDecks[0] ? formatKey(compareDecks[0].format) : null, [compareDecks]);
  const detectedPasteCommander = useMemo(() => {
    const format = lockedFormat ?? pasteFormat;
    if (format !== 'commander' || pasteCommander.trim() || !pasteText.trim()) return null;
    return extractCommanderGuess(pasteText);
  }, [lockedFormat, pasteCommander, pasteFormat, pasteText]);
  const filteredSavedDecks = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    return decks.filter((deck) => {
      if (compareDecks.some((item) => item.input.type === 'saved' && item.input.deckId === deck.id)) return false;
      if (lockedFormat && formatKey(deck.format) !== lockedFormat) return false;
      if (!q) return true;
      return `${deck.title ?? ''} ${deck.commander ?? ''}`.toLowerCase().includes(q);
    });
  }, [compareDecks, decks, lockedFormat, savedSearch]);

  useEffect(() => {
    const deck1 = searchParams.get('deck1');
    if (!deck1 || compareDecks.length > 0) return;
    const deck = decks.find((item) => item.id === deck1);
    if (deck) addSavedDeck(deck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, decks]);

  function addDeck(draft: CompareDeckDraft): boolean {
    if (compareDecks.length >= MAX_DECKS) {
      setError(`Deck Compare can compare up to ${MAX_DECKS} decks.`);
      return false;
    }
    const nextFormat = formatKey(draft.format);
    if (!nextFormat) {
      setError(`${draft.title} uses a format Deck Compare does not support yet.`);
      return false;
    }
    if (lockedFormat && nextFormat !== lockedFormat) {
      setError(`${draft.title} is ${formatLabel(draft.format)}. This comparison is locked to ${formatLabel(lockedFormat)}.`);
      return false;
    }
    setCompareDecks((prev) => [...prev, draft]);
    setResult(null);
    setError(null);
    return true;
  }

  function addSavedDeck(deck: Deck) {
    addDeck({
      id: `saved-${deck.id}`,
      source: 'saved',
      title: deck.title || 'Untitled deck',
      commander: deck.commander ?? null,
      format: formatLabel(deck.format),
      cardCount: null,
      input: { type: 'saved', deckId: deck.id },
    });
  }

  async function addPublicDeck() {
    const deckId = extractPublicDeckId(publicInput);
    if (!deckId) {
      setError('Paste a ManaTap public deck URL or deck ID.');
      return;
    }
    if (compareDecks.some((deck) => deck.input.type !== 'pasted' && deck.input.deckId === deckId)) {
      setError('That deck has already been added.');
      return;
    }
    setLoadingPublic(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, { credentials: 'include', cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; deck?: { id?: string; title?: string | null; commander?: string | null; format?: string | null; is_public?: boolean }; cards?: Array<{ qty?: number; zone?: string | null }>; error?: string };
      if (!res.ok || json.ok !== true || !json.deck) {
        setError(json.error || 'That public deck could not be loaded.');
        return;
      }
      const count = (json.cards ?? []).reduce((sum, row) => {
        const zone = String(row.zone || 'mainboard').toLowerCase();
        if (zone === 'sideboard' || zone === 'maybeboard') return sum;
        return sum + Math.max(1, Math.floor(Number(row.qty) || 1));
      }, 0);
      if (addDeck({
        id: `public-${deckId}`,
        source: 'public',
        title: json.deck.title || 'Public deck',
        commander: json.deck.commander ?? null,
        format: formatLabel(json.deck.format),
        cardCount: count,
        input: { type: 'public', deckId },
      })) {
        setPublicInput('');
      }
    } finally {
      setLoadingPublic(false);
    }
  }

  function addPastedDeck() {
    const text = pasteText.trim();
    if (!text) {
      setError('Paste a decklist first.');
      return;
    }
    const format = lockedFormat ?? pasteFormat;
    const label = formatLabel(format);
    const count = deckTextCardCount(text, label);
    const min = minCardsForFormat(label);
    if (count < min) {
      setError(`Pasted ${label} deck needs at least ${min} cards.`);
      return;
    }
    if (format !== 'commander' && count > 75) {
      setError(`Pasted ${label} decklists can be 75 cards max.`);
      return;
    }
    const commander = format === 'commander' ? pasteCommander.trim() : null;
    if (format === 'commander' && !commander) {
      setError('Pick the commander for this pasted Commander deck before adding it.');
      return;
    }
    if (addDeck({
      id: `pasted-${Date.now()}`,
      source: 'pasted',
      title: pasteTitle.trim() || 'Pasted decklist',
      commander,
      format: label,
      cardCount: count,
      input: { type: 'pasted', title: pasteTitle.trim() || undefined, deckText: text, format: label, commander },
    })) {
      setPasteTitle('');
      setPasteCommander('');
      setPasteText('');
      setPasteOpen(false);
    }
  }

  async function handleCompare() {
    if (compareDecks.length < 2) {
      setError('Add at least two decks.');
      return;
    }
    setComparing(true);
    setError(null);
    setDeepAiError(null);
    try {
      const response = await runCompareV2(compareDecks.map((deck) => deck.input));
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response);
    } finally {
      setComparing(false);
    }
  }

  async function handleGenerateDeepAi() {
    if (!result) return;
    setDeepAiLoading(true);
    setDeepAiError(null);
    try {
      const response = await runDeepAi(result);
      if (!response.ok) {
        setDeepAiError(response.error);
        return;
      }
      setResult(response);
    } finally {
      setDeepAiLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-950/70 via-neutral-950 to-sky-950/50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-amber-200">
              <GitCompare size={14} /> Deck Compare
            </div>
            <h2 className="text-2xl font-black text-white md:text-3xl">Compare full pods, not just lists</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-300">
              Add saved decks, public ManaTap deck links, or pasted lists. First deck locks the format; compare up to six decks with power, value, matchup, and table-read context.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-300">
            <span className="font-black text-amber-200">{compareDecks.length}/{MAX_DECKS}</span> decks added
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
          <button type="button" onClick={() => setSavedOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-2 text-lg font-black"><FolderPlus size={18} className="text-amber-200" /> Add saved deck</span>
            <ChevronDown size={18} className={savedOpen ? 'rotate-180 transition' : 'transition'} />
          </button>
          {savedOpen ? (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input value={savedSearch} onChange={(event) => setSavedSearch(event.target.value)} placeholder="Search saved decks" className="w-full rounded-xl border border-neutral-800 bg-black/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-300/50" />
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredSavedDecks.slice(0, 40).map((deck) => (
                  <button key={deck.id} type="button" onClick={() => addSavedDeck(deck)} className="w-full rounded-xl border border-neutral-800 bg-white/[0.035] p-3 text-left transition hover:border-amber-300/40">
                    <div className="truncate text-sm font-bold text-white">{deck.title || 'Untitled deck'}</div>
                    <div className="mt-1 truncate text-xs text-neutral-500">{formatLabel(deck.format)}{deck.commander ? ` · ${deck.commander}` : ''}</div>
                  </button>
                ))}
                {!filteredSavedDecks.length ? <p className="text-sm text-neutral-500">No eligible saved decks found.</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
          <div className="mb-3 flex items-center gap-2 text-lg font-black"><ExternalLink size={18} className="text-sky-200" /> Add public deck</div>
          <input value={publicInput} onChange={(event) => setPublicInput(event.target.value)} placeholder="Paste public deck URL or ID" className="w-full rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-sm outline-none focus:border-sky-300/50" />
          <button type="button" onClick={addPublicDeck} disabled={loadingPublic} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-sm font-black text-black disabled:opacity-60">
            {loadingPublic ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Add public
          </button>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
          <button type="button" onClick={() => setPasteOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-2 text-lg font-black"><ClipboardList size={18} className="text-emerald-200" /> Paste list</span>
            <ChevronDown size={18} className={pasteOpen ? 'rotate-180 transition' : 'transition'} />
          </button>
          {pasteOpen ? (
            <div className="mt-4 space-y-3">
              <input value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} placeholder="Optional title" className="w-full rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-300/50" />
              <div className="grid grid-cols-2 gap-2">
                <select value={lockedFormat ?? pasteFormat} disabled={!!lockedFormat} onChange={(event) => setPasteFormat(event.target.value as DeckFormatCanonical)} className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-sm outline-none">
                  {FORMAT_OPTIONS.map((option) => <option key={option} value={option}>{FORMAT_LABEL[option]}</option>)}
                </select>
                {(lockedFormat ?? pasteFormat) === 'commander' ? (
                  <input value={pasteCommander} onChange={(event) => setPasteCommander(event.target.value)} placeholder="Commander" className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-300/50" />
                ) : <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-2 text-sm text-neutral-500">75 max</div>}
              </div>
              {detectedPasteCommander ? (
                <button
                  type="button"
                  onClick={() => setPasteCommander(detectedPasteCommander)}
                  className="w-full rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-left text-xs font-bold text-emerald-100 hover:border-emerald-300/50"
                >
                  Use detected commander: {detectedPasteCommander}
                </button>
              ) : null}
              {lockedFormat ? <p className="text-xs text-neutral-500">Format locked to {FORMAT_LABEL[lockedFormat]}.</p> : null}
              <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="1 Sol Ring&#10;1 Arcane Signet..." rows={8} className="w-full rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-300/50" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">{deckTextCardCount(pasteText, lockedFormat ?? pasteFormat)} cards detected</span>
                <button type="button" onClick={addPastedDeck} className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-black">Add pasted</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {compareDecks.length ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">Comparison group</h2>
            {lockedFormat ? <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">{FORMAT_LABEL[lockedFormat]} locked</span> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {compareDecks.map((deck, index) => (
              <div key={deck.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase text-neutral-500">Deck {index + 1} · {deck.source}</div>
                    <div className="mt-1 truncate text-base font-black text-white">{deck.title}</div>
                    <div className="mt-1 truncate text-xs text-neutral-500">{deck.format}{deck.cardCount ? ` · ${deck.cardCount} cards` : ''}{deck.commander ? ` · ${deck.commander}` : ''}</div>
                  </div>
                  <button type="button" onClick={() => { setCompareDecks((prev) => prev.filter((item) => item.id !== deck.id)); setResult(null); }} className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Remove ${deck.title}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">{compareDecks.length < 2 ? 'Add at least two decks to compare.' : 'Ready to run the V2 pod comparison.'}</p>
            <button type="button" onClick={handleCompare} disabled={comparing || compareDecks.length < 2} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-sky-300 px-5 py-3 text-sm font-black text-black disabled:opacity-50">
              {comparing ? <Loader2 size={17} className="animate-spin" /> : <BarChart3 size={17} />}
              {comparing ? 'Comparing...' : 'Compare decks'}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      {result ? (
        <ResultsView
          result={result}
          isPro={isPro}
          currency={currency}
          onGenerateDeepAi={handleGenerateDeepAi}
          deepAiLoading={deepAiLoading}
          deepAiError={deepAiError}
        />
      ) : null}
    </div>
  );
}

function useProStatusSafe() {
  const [state, setState] = useState({ isPro: false });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/pro-status', { cache: 'no-store', credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setState({ isPro: json?.ok === true && json?.isPro === true });
      })
      .catch(() => {
        if (!cancelled) setState({ isPro: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
