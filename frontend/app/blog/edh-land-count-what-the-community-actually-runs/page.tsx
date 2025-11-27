import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EDH Land Count: What the Community Actually Runs | ManaTap AI',
  description: 'Data-driven analysis of optimal land counts in Commander decks. Learn how many lands to run based on your deck\'s strategy, ramp, and curve.',
  keywords: 'EDH land count, commander how many lands, MTG land count, EDH mana base',
  alternates: {
    canonical: '/blog/edh-land-count-what-the-community-actually-runs',
  },
};

const content = `
# EDH Land Count: What the Community Actually Runs

"How many lands should I run?" It's the most common question in Commander deck building. Let's look at what actually works.

## The Standard Answer

**Most Commander decks run 33-37 lands.**

This is the baseline, but your exact count depends on:
- Your deck's average mana cost
- How much ramp you're running
- Your commander's color requirements
- Your deck's strategy

## Land Count by Strategy

### Low-Curve Aggro (Average CMC 2-3)
**Recommended**: 33-35 lands

These decks want to play multiple spells per turn early. They need fewer lands because:
- Cards cost less mana
- They win before needing 7+ mana
- They run more ramp to compensate

**Example**: Krenko goblin tribal, Talrand spellslinger

### Midrange (Average CMC 3-4)
**Recommended**: 35-37 lands

The sweet spot for most Commander decks. Balanced curve means balanced land count.

**Example**: Most value-based commanders, goodstuff decks

### Ramp/Stompy (Average CMC 4-5+)
**Recommended**: 36-38 lands

These decks need to hit land drops consistently to cast expensive threats.

**Example**: Green ramp decks, big creature strategies

### Combo/Control (Variable CMC)
**Recommended**: 34-36 lands

Combo decks need specific pieces, not necessarily lots of mana. Control needs consistent mana for answers.

**Example**: Thassa's Oracle combo, permission-based control

## How Ramp Affects Land Count

**General Rule**: For every 2 ramp pieces, you can cut 1 land.

- **8-10 ramp pieces**: 33-35 lands
- **10-12 ramp pieces**: 34-36 lands  
- **12+ ramp pieces**: 35-37 lands (don't go below 33!)

**Why**: Ramp accelerates you, but you still need lands to cast your ramp and your threats.

## Color Requirements

### 1-2 Colors
**Land Count**: 33-36 lands

Easy to fix with basics. Can run more utility lands.

### 3 Colors
**Land Count**: 35-37 lands

Need more fixing. Include Command Tower, Exotic Orchard, and budget duals.

### 4-5 Colors
**Land Count**: 36-38 lands

Maximum fixing needed. Every non-basic should fix colors.

## Common Land Count Mistakes

### Too Few Lands (< 33)
**Problem**: You'll get mana screwed. Can't cast spells = losing.

**Fix**: Add 2-4 more lands. Basics are fine if you're on a budget.

### Too Many Lands (> 38)
**Problem**: You'll flood. Drawing lands when you need spells = losing.

**Fix**: Cut 2-3 lands, add more spells that impact the game.

### Ignoring Ramp When Counting
**Problem**: "I have 10 ramp pieces, so I only need 30 lands."

**Fix**: Ramp doesn't replace lands. You need lands to cast ramp AND your threats.

## Land Count by Commander Type

### Landfall Commanders
**Recommended**: 38-42 lands

These decks want lands in play. Run more basics and land-typed duals.

**Example**: Aesi, Tatyova, Omnath

### Low-CMC Commanders
**Recommended**: 33-35 lands

If your commander costs 2-3, you can afford fewer lands.

**Example**: Krenko, Talrand, Zada

### Expensive Commanders (6+ mana)
**Recommended**: 36-38 lands

You need to reliably cast your commander. Don't skimp on lands.

**Example**: Big dragons, expensive planeswalkers

## Utility Lands

**How many?** 5-10 utility lands is typical.

**Include**:
- Command Tower (if multi-color)
- Exotic Orchard (if multi-color)
- Field of Ruin / Ghost Quarter (land destruction)
- Reliquary Tower (if you draw lots of cards)
- Bojuka Bog (graveyard hate)

**Don't overdo it**: Too many utility lands = color screw.

## Testing Your Land Count

**Use ManaTap AI's Mulligan Simulator** to test your land count:

1. Import your deck
2. Run the mulligan simulator
3. See how often you get playable hands
4. Adjust land count based on results

[Test Your Land Count →](/tools/mulligan)

## The Bottom Line

**Start with 35-36 lands** for most decks. Then adjust based on:
- Your curve (lower = fewer lands)
- Your ramp (more ramp = slightly fewer lands)
- Your colors (more colors = slightly more lands)

**Test it**: Play games. If you're mana screwed, add lands. If you're flooding, cut lands.

## Use ManaTap AI to Optimize Your Mana Base

Our AI deck analyzer checks your land count and suggests improvements:

- Identifies if you're running too few or too many lands
- Suggests utility lands for your strategy
- Analyzes color fixing needs
- Recommends budget-friendly alternatives

[Analyze Your Mana Base →](/mtg-commander-ai-deck-builder)

---

*Related: [How to Build Your First Commander Deck](/blog/how-to-build-your-first-commander-deck) | [Mana Curve Mastery](/blog/mana-curve-mastery)*
`;

export default function BlogPost() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors mb-8"
        >
          ← Back to Blog
        </Link>

        <article className="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 border border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: content
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/\*([^*]+)\*/g, '<em>$1</em>')
              .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 dark:text-blue-400 hover:underline">$1</a>')
              .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold mb-6 mt-8">$1</h1>')
              .replace(/^## (.+)$/gm, '<h2 class="text-3xl font-bold mb-4 mt-10">$1</h2>')
              .replace(/^### (.+)$/gm, '<h3 class="text-2xl font-bold mb-3 mt-8">$1</h3>')
              .replace(/^\- (.+)$/gm, '<li class="mb-2">$1</li>')
              .replace(/\n\n/g, '</p><p class="mb-6">')
              .replace(/^(.+)$/gm, '<p class="mb-6">$1</p>')
            }} />
          </div>
        </article>
      </div>
    </div>
  );
}

