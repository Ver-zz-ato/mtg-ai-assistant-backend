"use client";
import React from "react";

const GLOSSARY: Record<string, string> = {
  ramp: "Effects that accelerate your mana (e.g., mana rocks, land ramp).",
  draw: "Card advantage effects that draw extra cards over time.",
  removal: "Spells or abilities that remove opposing threats (destroy/exile/bounce/counter).",
  hypergeometric: "A probability distribution describing draws without replacement (like drawing cards from a deck).",
  mulligan: "A rule for redrawing your opening hand; the London mulligan draws 7 each time, then bottoms cards equal to mulligans taken.",
  curve: "Mana curve — distribution of mana values across your spells.",
  color_fixing: "Access to the colors of mana your deck needs by the turns you need them.",
};

export function GlossaryTooltip({ term, children }: { term: string; children: React.ReactNode }){
  const key = term.toLowerCase().replace(/\s+/g,'_');
  const def = GLOSSARY[key] || GLOSSARY[term.toLowerCase()] || undefined;
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline-block group">
      <span className="underline decoration-dotted cursor-help" aria-label={def} title={def}>{children}</span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block z-50 whitespace-nowrap text-[11px] bg-black text-white border border-neutral-700 rounded px-2 py-1 shadow-lg">
        {def}
      </span>
    </span>
  );
}

export function glossaryDefine(term: string): string | undefined {
  const key = term.toLowerCase().replace(/\s+/g,'_');
  return GLOSSARY[key] || GLOSSARY[term.toLowerCase()];
}
