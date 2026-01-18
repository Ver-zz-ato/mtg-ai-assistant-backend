import Link from 'next/link';
import { Metadata } from 'next';
import BlogImage from '@/components/BlogImage';

export const metadata: Metadata = {
  title: 'How ManaTap\'s MTG AI Deck Builder Works | ManaTap AI',
  description: 'A plain-English explanation (plus a technical deep dive) of how ManaTap analyzes MTG decks for legality, colour identity, balance, and synergy.',
  keywords: 'how manatap ai works, mtg ai deck builder, ai deck analysis, mtg deck analyzer how it works, magic the gathering ai',
  alternates: {
    canonical: '/blog/how-manatap-ai-works',
  },
  openGraph: {
    title: 'How ManaTap\'s MTG AI Deck Builder Works | ManaTap AI',
    description: 'A plain-English explanation (plus a technical deep dive) of how ManaTap analyzes MTG decks for legality, colour identity, balance, and synergy.',
    url: 'https://www.manatap.ai/blog/how-manatap-ai-works',
    type: 'article',
  },
};

const content = `
# How ManaTap's MTG AI Deck Builder Works

ManaTap is an AI-powered Magic: The Gathering deck builder designed to help you understand **what your deck is doing**, what it's missing, and how to improve it — without breaking format rules or your intended playstyle.

This page explains how it works in two layers:
- A **simple explanation** for most players
- A **technical deep dive** for anyone who wants the details

---

## <span id="simple"></span>🔍 How ManaTap's MTG AI Deck Builder Works (Simple Explanation)

When you submit a deck, ManaTap doesn't just look at individual cards in isolation. It looks at the **whole deck**: your commander (if you're in Commander), your colours, your mana curve, and the overall plan your deck seems built around.

### ⚖️ 1) Rules and format checks come first
Before any suggestions happen, ManaTap checks the fundamentals:
- Is the deck legal for the selected format (Commander, Standard, Modern)?
- Does it follow deckbuilding rules (deck size, copy limits, commander rules)?
- Does anything break **colour identity** (Commander)?

If something is illegal or doesn't match the format you selected, ManaTap flags it clearly instead of guessing.

### 📊 2) Then it checks deck balance
Next, ManaTap looks at whether the deck has the pieces most decks need to function:
- Enough mana sources and the right curve
- Enough card draw / selection
- Enough interaction (removal, counterspells, protection)
- A clear path to winning (and the support to get there)

If you're light on removal, short on ramp, or overloaded in one area, it points that out.

### 🧠 3) The AI figures out what you're trying to build
Different archetypes need different ingredients. A token deck, a sacrifice deck, a spellslinger deck, and a land-based deck all play very differently.

ManaTap looks for patterns in your cards to infer your strategy and how well the list supports it — and it treats that inference as a working hypothesis, not an absolute truth.

### 💡 4) Only then does it suggest changes
ManaTap doesn't just recommend popular or expensive cards. It suggests cards that actually fit:
- Your format
- Your colours / colour identity
- Your deck's apparent plan
- Your budget / goals (when provided)

The goal isn't to tell you there's one "perfect" deck or to claim it can solve the meta. Magic is too varied for that. The goal is to help you build a deck that **makes sense**, plays the way you want it to, and avoids common mistakes.

---

## 🔬 Want the technical details?

The section below explains the analysis pipeline in more depth — including how ManaTap keeps suggestions grounded in real MTG constraints.

---

## <span id="technical"></span>⚙️ How ManaTap's AI Works (Technical Deep Dive)

Artificial intelligence gets thrown around a lot in Magic: The Gathering tools. Sometimes it means a rules engine. Sometimes it means a pile of heuristics. Sometimes it just means autocomplete.

ManaTap is different — not because it's magic, but because it's deliberate about **what AI is good at**, **what it isn't**, and **how MTG actually works as a game**.

### 🎯 The core problem with MTG deckbuilding AI

Magic decks aren't just lists of cards. They're constrained systems shaped by:
- format legality
- colour identity
- archetype roles
- mana curves
- synergy chains
- player intent (budget, power level, playstyle)

Most "AI deck builders" fail because they flatten this complexity. They recommend strong cards in isolation, ignore context, or hallucinate interactions that don't actually work.

ManaTap's approach is to model the structure of a deck first, then apply AI on top of that structure.

### 📋 Step 1: Deck parsing and rules grounding

When you submit a deck, ManaTap doesn't start by generating suggestions. It starts by understanding the deck as a rules-bound object.

This includes:
- validating the format (Commander, Standard, Modern)
- enforcing deck size and copy limits
- applying Commander colour identity rules
- flagging illegal or ambiguous cards early

This step is intentionally deterministic. No AI creativity. No guessing.

If a deck is illegal, ManaTap says so — and explains why.

### 🔧 Step 2: Structural analysis (mana, roles, balance)

Next, the system breaks the deck into functional roles, not just card types.

For example:
- ramp vs acceleration
- card draw vs selection
- interaction vs protection
- threats vs enablers
- payoff vs setup

This allows ManaTap to evaluate:
- mana curve health
- early-game vs late-game balance
- missing roles (e.g. low removal density)
- over-concentration in one category

This is the baseline, not the final answer.

### 🎨 Step 3: Archetype and strategy inference

ManaTap looks at:
- commanders
- repeated mechanical patterns
- known archetype signals (tokens, sacrifice, spellslinger, landfall, etc.)
- how cards support each other across turns

From this, it infers what the deck is trying to do, not just what cards are present.

Importantly:
- this is treated as a working hypothesis
- ManaTap can say "this looks like X, but Y cards pull in another direction"

### 🔗 Step 4: Synergy chains, not card power

ManaTap does not rank cards by raw power. Instead, it looks for synergy chains:
- cards that enable other cards
- cards that scale together
- cards that only work if certain conditions are met

This prevents classic AI mistakes like:
- recommending staples that don't advance the deck's plan
- suggesting "good cards" that break colour or budget constraints
- missing subtle but critical interactions

If a suggestion doesn't clearly support the inferred strategy, it's discarded.

### 💬 Step 5: Language-model reasoning (LLM layer)

Only after the above does the language model come into play.

The LLM's role is to:
- explain why something is a problem
- describe trade-offs clearly
- suggest changes in human terms
- adapt advice to budget, power level, and intent

Crucially:
- the LLM is constrained by validated data
- it can't invent card text or interactions
- it must justify recommendations against the deck's structure

This is why ManaTap's responses are designed to be more reliable than generic AI chat.

### 🚫 Why ManaTap won't "solve the meta"

ManaTap isn't trying to be an oracle. It won't:
- guarantee the best possible deck
- claim one optimal list exists
- override player goals
- invent interactions it can't verify

Magic is a social, evolving game. The "best" deck depends on local metas, table expectations, personal taste, and budget reality.

ManaTap's job is to make your deck make sense — not make decisions for you.

### 🗓️ Where this is going next

Future improvements focus on:
- deeper archetype recognition
- better playstyle inference
- stronger budget awareness
- clearer explanations for edge cases

The goal isn't to replace deckbuilding — it's to make better deckbuilding easier.
`;

export default function HowManaTapAIWorksPage() {
  return (
    <>
      {/* Hero Section */}
      <div className="relative h-[40vh] min-h-[300px] bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 overflow-hidden">
        <BlogImage
          src="https://cards.scryfall.io/art_crop/front/c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg"
          alt="How ManaTap's MTG AI Deck Builder Works"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20"></div>
        <div className="absolute inset-0 bg-black/30"></div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 h-full flex flex-col justify-end pb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-900/60 text-purple-100 backdrop-blur-sm">
              Strategy
            </span>
            <span className="text-sm text-white/90 backdrop-blur-sm bg-black/20 px-3 py-1.5 rounded-full">
              10 min read
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            How ManaTap's MTG AI Deck Builder Works
          </h1>

          <div className="flex items-center gap-4 text-sm text-white/90 backdrop-blur-sm bg-black/20 px-4 py-2 rounded-full w-fit">
            <span className="font-medium">ManaTap Team</span>
            <span>•</span>
            <span>
              {new Date('2026-01-17').toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors mb-8 shadow-sm"
        >
          ← Back to Blog
        </Link>

        {/* Article */}
        <article className="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 border border-gray-200 dark:border-gray-700 shadow-xl max-w-4xl mx-auto">
          {/* Content with enhanced styling */}
          <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-5xl md:prose-h1:text-6xl lg:prose-h1:text-7xl prose-h1:mb-6 prose-h1:mt-8 prose-h1:bg-gradient-to-r prose-h1:from-blue-600 prose-h1:to-purple-600 dark:prose-h1:from-blue-400 dark:prose-h1:to-purple-400 prose-h1:bg-clip-text prose-h1:text-transparent prose-h1:leading-tight prose-h2:text-3xl prose-h2:mt-10 prose-h2:mb-6 prose-h2:text-gray-900 dark:prose-h2:text-white prose-h2:font-extrabold prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4 prose-h3:font-bold prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-p:mb-6 prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-bold prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-ul:my-6 prose-li:my-3 prose-ul:space-y-2 prose-ol:my-6 prose-ol:space-y-2 prose-img:rounded-xl prose-img:shadow-xl prose-code:text-sm prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-2 prose-code:py-1 prose-code:rounded">
            <div dangerouslySetInnerHTML={{ __html: (() => {
              const lines = content.split('\n');
              const elements: string[] = [];
              let inList = false;
              let currentParagraph: string[] = [];
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (!line) {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  if (currentParagraph.length > 0) {
                    elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                  }
                  continue;
                }
                
                // Handle horizontal rules
                if (line === '---' || line === '***' || line === '___') {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  if (currentParagraph.length > 0) {
                    elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                  }
                  elements.push('<hr class="my-8 border-gray-300 dark:border-gray-700" />');
                  continue;
                }
                
                if (line.startsWith('# ')) {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  if (currentParagraph.length > 0) {
                    elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                  }
                  elements.push(`<h1>${line.substring(2)}</h1>`);
                } else if (line.startsWith('## ')) {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  if (currentParagraph.length > 0) {
                    elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                  }
                  // Handle anchor IDs in h2 headings (format: ## <span id="anchor"></span>Heading Text)
                  let headingText = line.substring(3);
                  let headingId = '';
                  const idMatch = headingText.match(/<span id="([^"]+)"><\/span>\s*(.*)/);
                  if (idMatch) {
                    headingId = idMatch[1];
                    headingText = idMatch[2] || headingText.replace(/<span id="[^"]+"><\/span>\s*/, '');
                  }
                  const idAttr = headingId ? ` id="${headingId}"` : '';
                  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
                  headingText = headingText.replace(linkRegex, '<a href="$2">$1</a>');
                  // Handle bold in headings
                  headingText = headingText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                  elements.push(`<h2${idAttr}>${headingText}</h2>`);
                } else if (line.startsWith('### ')) {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  if (currentParagraph.length > 0) {
                    elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                  }
                  let h3Text = line.substring(4);
                  // Handle bold in h3 headings
                  h3Text = h3Text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                  elements.push(`<h3>${h3Text}</h3>`);
                } else if (line.startsWith('- ')) {
                  if (!inList) {
                    if (currentParagraph.length > 0) {
                      elements.push(`<p>${currentParagraph.join(' ')}</p>`);
                      currentParagraph = [];
                    }
                    elements.push('<ul>');
                    inList = true;
                  }
                  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
                  let listItem = line.substring(2);
                  listItem = listItem.replace(linkRegex, '<a href="$2">$1</a>');
                  // Handle bold text **text** within list items
                  listItem = listItem.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                  // Handle span with id
                  listItem = listItem.replace(/<span id="([^"]+)"><\/span>/g, '<span id="$1"></span>');
                  elements.push(`<li>${listItem}</li>`);
                } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
                  // Only treat standalone bold lines as bold if they're not part of a paragraph
                  const text = line.substring(2, line.length - 2);
                  if (currentParagraph.length === 0) {
                    elements.push(`<p><strong>${text}</strong></p>`);
                  } else {
                    currentParagraph.push(`<strong>${text}</strong>`);
                  }
                } else {
                  if (inList) {
                    elements.push('</ul>');
                    inList = false;
                  }
                  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
                  let processedLine = line;
                  processedLine = processedLine.replace(linkRegex, '<a href="$2">$1</a>');
                  processedLine = processedLine.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
                  // Handle bold text **text** within paragraphs
                  processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                  // Handle span with id
                  processedLine = processedLine.replace(/<span id="([^"]+)"><\/span>/g, '<span id="$1"></span>');
                  currentParagraph.push(processedLine);
                }
              }
              
              if (inList) {
                elements.push('</ul>');
              }
              if (currentParagraph.length > 0) {
                elements.push(`<p>${currentParagraph.join(' ')}</p>`);
              }
              
              return elements.join('\n');
            })() }} />
          </div>

          {/* CTA Section */}
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-xl p-8 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Try ManaTap AI Deck Builder
              </h2>
              <p className="text-white/90 mb-6 max-w-2xl mx-auto">
                See how ManaTap's AI analyzes your deck for legality, balance, and synergy. Get instant deck analysis that understands MTG rules, archetypes, and card interactions.
              </p>
              <Link
                href="/mtg-ai-deck-builder"
                className="inline-block px-8 py-4 bg-white text-gray-900 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                Start Building Your Deck →
              </Link>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
