'use client';

import { useState } from 'react';
import Link from 'next/link';
import type React from 'react';

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

const faqItems: FAQItem[] = [
  {
    question: 'Is the AI Commander deck builder really free?',
    answer:
      "Yes. Guests can try ManaTap's core deck tools with limited usage. Signed-in free users get more analysis and saved deck features. Pro unlocks deeper tools such as advanced deck analysis, deck version history, budget swaps, and more detailed recommendations.",
  },
  {
    question: 'How does the deck checker work?',
    answer: (
      <div className="space-y-4">
        <p>ManaTap evaluates decks more like a deckbuilding assistant than a chatbot.</p>
        <p>
          ManaTap does not just look at individual card power. It checks your deck in layers:
          format legality, Commander colour identity, mana curve, ramp, draw, interaction, win
          conditions, and synergy patterns.
        </p>
        <p>
          It then looks for what your deck appears to be trying to do: tokens, spellslinger,
          sacrifice, landfall, control, combat, or another strategy and suggests changes that
          support that plan instead of blindly recommending staples.
        </p>
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/45 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="space-y-1 text-sm font-medium leading-6 text-slate-200">
            <p>Import deck</p>
            <p className="text-amber-300/80">{'->'}</p>
            <p>Check legality &amp; colour identity</p>
            <p className="text-amber-300/80">{'->'}</p>
            <p>Analyze ramp, draw, interaction</p>
            <p className="text-amber-300/80">{'->'}</p>
            <p>Infer strategy &amp; synergy</p>
            <p className="text-amber-300/80">{'->'}</p>
            <p>Suggest better-fit improvements</p>
          </div>
        </div>
        <Link
          href="https://www.manatap.ai/blog/how-manatap-ai-works-updated"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-sky-300 transition-colors hover:text-sky-200 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:ring-offset-2 focus:ring-offset-[#101a2b]"
        >
          Read how ManaTap&apos;s AI works
          <span aria-hidden>{'->'}</span>
        </Link>
      </div>
    ),
  },
  {
    question: 'Does ManaTap use public deck data?',
    answer:
      'ManaTap combines multiple sources of information depending on the tool being used, including card databases, format rules, synergy analysis, and public deck trends. Popular cards can influence recommendations, but ManaTap does not blindly copy the most-played lists. The goal is to understand how cards function together inside your specific deck.',
  },
  {
    question: 'Can ManaTap build competitive decks?',
    answer:
      'ManaTap can help refine competitive and high-power decks, but it is designed primarily as a deckbuilding assistant, not a tournament oracle. It can identify structural issues, synergy gaps, weak mana curves, and inefficient packages, but final tuning still depends on your local meta, matchup expectations, and personal playstyle.',
  },
  {
    question: 'Does ManaTap support formats besides Commander?',
    answer:
      'Yes. ManaTap supports Commander and is expanding support for formats like Standard, Modern, Pioneer, and Pauper. Some features are currently deeper for Commander because multiplayer deckbuilding has more structural complexity and demand.',
  },
  {
    question: 'Will ManaTap replace deckbuilding creativity?',
    answer:
      "No. ManaTap is designed to support creativity, not replace it. The goal is to help players spot weaknesses, test ideas faster, and understand trade-offs while keeping the final decisions entirely in the player's hands.",
  },
  {
    question: 'What ManaTap will not do',
    answer: (
      <ul className="list-none space-y-3.5 pl-0">
        <li className="flex items-start gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
          <span>
            <strong className="text-white">
              Won&apos;t replace judges or official tournament rulings
            </strong>{' '}
            - always verify competitive rulings with official sources.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
          <span>
            <strong className="text-white">
              Won&apos;t guarantee &quot;the best deck&quot; or solve the meta
            </strong>{' '}
            - Magic depends on local tables, budget, and playstyle.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
          <span>
            <strong className="text-white">Won&apos;t invent card text or interactions</strong> -
            if something cannot be verified, it should say so.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
          <span>
            <strong className="text-white">
              Won&apos;t ignore format legality or Commander colour identity
            </strong>{' '}
            - legal constraints should be flagged clearly.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
          <span>
            <strong className="text-white">Won&apos;t optimize blindly</strong> - recommendations
            should respect budget, power level, and player goals.
          </span>
        </li>
      </ul>
    ),
  },
];

const trustChips = ['Format-aware', 'Commander-aware', 'Synergy-first', 'No judge replacement'];

export default function HomepageFAQ({
  defaultCollapsed = false,
  compact = false,
  maxItems,
}: {
  defaultCollapsed?: boolean;
  compact?: boolean;
  maxItems?: number;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultCollapsed ? null : 0);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const visibleItems =
    typeof maxItems === "number" ? faqItems.slice(0, maxItems) : faqItems;

  return (
    <section className={`mx-auto w-full ${compact ? "px-0 py-0" : "px-2 py-4"}`}>
      <div
        className={`overflow-hidden border border-slate-700/60 bg-[linear-gradient(180deg,rgba(7,18,34,0.96),rgba(9,16,28,0.94))] shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${
          compact ? "rounded-2xl" : "rounded-[28px]"
        }`}
      >
        <div className={`border-b border-slate-800/80 ${compact ? "px-4 py-4 md:px-5" : "px-5 py-6 md:px-6"}`}>
          <div className="space-y-4">
            <div className="space-y-3">
              <h2
                className={`text-center font-bold leading-tight text-white ${
                  compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
                }`}
              >
                Frequently Asked Questions
              </h2>
              {!compact ? (
                <p className="mx-auto max-w-[32rem] text-center text-sm leading-6 text-slate-300 md:text-[15px]">
                  Straight answers about what ManaTap&apos;s AI can do, what it checks, and where
                  human deckbuilding still matters.
                </p>
              ) : null}
            </div>

            {!compact ? (
              <div className="flex flex-wrap justify-center gap-2.5">
                {trustChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-slate-600/70 bg-slate-900/70 px-3 py-1.5 text-[11px] font-medium tracking-wide text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className={`space-y-3 ${compact ? "p-3 md:p-4" : "p-4 md:p-5"}`}>
          {visibleItems.map((item, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                  isOpen
                    ? 'border-amber-400/35 bg-[#16253b]/96 shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_0_28px_rgba(59,130,246,0.12)]'
                    : 'border-slate-700/80 bg-[#1a2638]/94 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
                }`}
              >
                <button
                  onClick={() => toggleItem(index)}
                  className={`flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors md:px-5 md:py-5 ${
                    isOpen ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'
                  }`}
                  aria-expanded={isOpen}
                >
                  <h3 className="pr-4 text-lg font-semibold leading-8 text-white md:text-[1.35rem] md:leading-9">
                    {item.question}
                  </h3>
                  <svg
                    className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? 'max-h-[1400px]' : 'max-h-0'
                  }`}
                >
                  <div className="px-4 pb-5 pt-0 md:px-5 md:pb-6">
                    <div
                      className={`border-t border-slate-700/70 pt-4 text-slate-300 ${
                        compact
                          ? "text-base leading-8 md:text-lg md:leading-9"
                          : "text-[15px] leading-8 md:text-base md:leading-8"
                      }`}
                    >
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
