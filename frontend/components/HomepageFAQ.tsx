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
    question: "Is the AI Commander deck builder really free?",
    answer: "Yes! Core deck analysis is free, but you need a free account signup to start analyzing decks. Some core features are available for free users, while advanced features like deck version history and advanced analytics require a Pro subscription."
  },
  {
    question: "How does the AI deck analyzer work?",
    answer: (
      <>
        Our AI understands MTG archetypes, card synergies, and Commander format rules. It analyzes your deck's mana curve, identifies missing pieces (ramp, draw, removal), and suggests cards that fit your strategy.
        {' '}
        <Link 
          href="/blog/how-manatap-ai-works#simple" 
          className="text-blue-500 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
        >
          Read how ManaTap's AI works
          <span>→</span>
        </Link>
      </>
    )
  },
  {
    question: "What ManaTap will not do",
    answer: (
      <ul className="space-y-3 list-none pl-0">
        <li className="flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 mt-0.5 font-bold">•</span>
          <span><strong className="text-gray-900 dark:text-gray-100">Won't replace judges or provide official tournament rulings</strong> — always verify with official sources for competitive play.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 mt-0.5 font-bold">•</span>
          <span><strong className="text-gray-900 dark:text-gray-100">Won't guarantee "the best deck" or solve the meta</strong> — suggestions are tools, not definitive answers.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 mt-0.5 font-bold">•</span>
          <span><strong className="text-gray-900 dark:text-gray-100">Won't invent card text or interactions</strong> — if it can't verify something, it will say so.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 mt-0.5 font-bold">•</span>
          <span><strong className="text-gray-900 dark:text-gray-100">Won't ignore format legality or color identity</strong> — flags issues explicitly when detected.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-gray-400 dark:text-gray-500 mt-0.5 font-bold">•</span>
          <span><strong className="text-gray-900 dark:text-gray-100">Won't optimize blindly without understanding your goals</strong> — asks about budget, power level, and playstyle preferences.</span>
        </li>
      </ul>
    )
  }
];

export default function HomepageFAQ({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultCollapsed ? null : 0);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-white dark:text-white mb-6">
          Frequently Asked Questions
        </h2>
        
        <div className="space-y-3">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => toggleItem(index)}
                className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                aria-expanded={openIndex === index}
              >
                <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white pr-4">
                  {item.question}
                </h3>
                <svg
                  className={`w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  openIndex === index ? 'max-h-[1000px]' : 'max-h-0'
                }`}
              >
                <div className="px-4 md:px-6 pb-4 md:pb-6 pt-0">
                  <div className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                    {item.answer}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
