import Link from 'next/link';
import { notFound } from 'next/navigation';

// Cache for 24 hours (blog content changes infrequently)
export const revalidate = 86400;

// This will be replaced with actual MDX content later
const blogContent: Record<string, {
  title: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  content: string;
}> = {
  'budget-edh-hidden-gems': {
    title: 'Building Budget EDH: 5 Hidden Gems Under $1',
    date: '2025-10-18',
    author: 'ManaTap Team',
    category: 'Budget Building',
    readTime: '5 min read',
    content: `
# Building Budget EDH: 5 Hidden Gems Under $1

Building a competitive Commander deck doesn't mean you need to spend hundreds of dollars. There are plenty of powerful cards that fly under the radar and cost less than a dollar. Here are five hidden gems that can elevate your deck without breaking the bank.

## 1. **Arcane Signet** (~$0.50)

While Sol Ring gets all the glory, Arcane Signet is equally essential in any Commander deck. It produces mana of any color in your commander's color identity for just two mana. This card has been reprinted multiple times, keeping its price low while maintaining its power level.

**Why it's great:** Fixes your mana and ramps you at the same time. Works in any multi-color deck.

## 2. **Windfall** (~$0.75)

Card draw is crucial in Commander, and Windfall provides it in spades. For just three mana, you and each opponent discard your hands and draw seven cards. In decks that can leverage the graveyard or benefit from wheels, this is an absolute powerhouse.

**Why it's great:** Refills your hand, disrupts opponents with full hands, and enables graveyard strategies.

## 3. **Ghostly Prison** (~$0.85)

In multiplayer games, you need ways to discourage attacks. Ghostly Prison makes your opponents pay {2} for each creature attacking you. This buys you time and makes you a less appealing target.

**Why it's great:** Passive protection that lets you develop your board while others fight each other.

## 4. **Nature's Lore** (~$0.60)

Ramp is essential, and Nature's Lore is one of the best budget options. For two mana, you can search for any Forest - including dual lands with the Forest type - and put it directly onto the battlefield untapped.

**Why it's great:** Fetches shock lands, battle lands, or triomes. Comes in untapped unlike many budget ramp spells.

## 5. **Vandalblast** (~$0.40)

Artifact removal is crucial in Commander, and Vandalblast offers incredible flexibility. For one mana, it destroys target artifact. But its overload cost of seven mana destroys ALL artifacts your opponents control, potentially winning games on the spot.

**Why it's great:** Versatile early game, devastating late game. Single-handedly shuts down artifact-heavy strategies.

## Using ManaTap's Budget Swaps Feature

Want to find more budget alternatives for expensive cards in your deck? ManaTap AI's Budget Swaps feature analyzes your deck and suggests cheaper alternatives that maintain synergy and power level.

**How to use it:**
1. Import your deck into ManaTap
2. Click "Budget Swaps" from your deck page
3. Review AI-powered suggestions
4. See exactly how much you'll save

Try it now at [manatap.ai/deck/swap-suggestions](/deck/swap-suggestions)

## Conclusion

Building on a budget doesn't mean sacrificing power. These five cards prove that you can find incredible value in the under-$1 range. Focus on efficiency, versatility, and cards that work well in multiplayer games.

**What's your favorite budget MTG card?** Share your hidden gems in the comments!

---

*Looking for more budget deck building tips? Check out our other articles on building competitive decks without breaking the bank.*
    `,
  },
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogContent[slug];

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          ← Back to Blog
        </Link>

        {/* Article */}
        <article className="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm font-semibold rounded-full">
                {post.category}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {post.readTime}
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {post.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>{post.author}</span>
              <span>•</span>
              <span>
                {new Date(post.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </header>

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: post.content.split('\n').map(line => {
              if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
              if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
              if (line.startsWith('**') && line.endsWith('**')) return `<p><strong>${line.slice(2, -2)}</strong></p>`;
              if (line.trim() === '') return '<br />';
              return `<p>${line}</p>`;
            }).join('')}} />
          </div>
        </article>

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Try ManaTap AI's Budget Swaps
          </h2>
          <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
            Find budget-friendly alternatives for expensive cards in your deck while maintaining power and synergy.
          </p>
          <Link
            href="/deck/swap-suggestions"
            className="inline-block px-6 py-3 bg-white text-blue-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
          >
            Find Budget Swaps
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return Object.keys(blogContent).map((slug) => ({
    slug,
  }));
}

