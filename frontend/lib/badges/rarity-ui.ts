export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export function normalizeBadgeRarity(value: string | null | undefined): BadgeRarity {
  return value === 'uncommon' || value === 'rare' || value === 'mythic' ? value : 'common';
}

export function badgeRarityLabel(value: string | null | undefined): string {
  const rarity = normalizeBadgeRarity(value);
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

export function getBadgeRarityClasses(value: string | null | undefined) {
  const rarity = normalizeBadgeRarity(value);

  switch (rarity) {
    case 'uncommon':
      return {
        rarity,
        card: 'border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(10,10,10,0.96))]',
        iconWrap: 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        chip: 'border border-emerald-400/30 bg-emerald-400/12 text-emerald-200',
        progress: 'from-emerald-400 via-teal-400 to-cyan-400',
        accentText: 'text-emerald-300',
      };
    case 'rare':
      return {
        rarity,
        card: 'border-sky-500/25 bg-[linear-gradient(135deg,rgba(59,130,246,0.10),rgba(88,28,135,0.10),rgba(10,10,10,0.96))]',
        iconWrap: 'border border-sky-400/25 bg-sky-400/12 text-sky-100',
        chip: 'border border-indigo-300/30 bg-indigo-400/14 text-indigo-100',
        progress: 'from-sky-400 via-indigo-400 to-violet-400',
        accentText: 'text-sky-300',
      };
    case 'mythic':
      return {
        rarity,
        card: 'border-amber-400/35 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(249,115,22,0.10),rgba(10,10,10,0.96))]',
        iconWrap: 'border border-amber-300/35 bg-amber-300/14 text-amber-100',
        chip: 'border border-orange-300/35 bg-amber-300/14 text-amber-100',
        progress: 'from-amber-300 via-orange-400 to-yellow-300',
        accentText: 'text-amber-200',
      };
    case 'common':
    default:
      return {
        rarity: 'common' as const,
        card: 'border-neutral-700 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(10,10,10,0.96))]',
        iconWrap: 'border border-white/10 bg-white/5 text-neutral-100',
        chip: 'border border-white/10 bg-white/6 text-neutral-300',
        progress: 'from-slate-400 via-slate-300 to-slate-500',
        accentText: 'text-neutral-300',
      };
  }
}
