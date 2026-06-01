import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import {
  renderBestCardsContent,
  BEST_CARDS_FAQ,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { CommanderStatsRibbon } from "@/components/commander/CommanderStatsRibbon";
import { CommanderToolActions } from "@/components/commander/CommanderToolActions";
import { CoreStaples } from "@/components/commander/CoreStaples";
import { GuideInlineText } from "@/components/commander/GuideInlineText";
import { getDetailsForNamesCached, getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";
const YSHTOLA_SLUG = "y-shtola-night-s-blessed";

function norm(s: string) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function cardSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const YSHTOLA_CARD_PACKAGES = [
  {
    title: "Turn Every Trigger Into Cards",
    kicker: "Engine",
    body:
      "Y'shtola deals damage herself, so curiosity effects are not cute here. They turn each mana value 3+ noncreature spell into drain plus extra cards.",
    cards: ["Curiosity", "Ophidian Eye", "Archmage Emeritus", "Rhystic Study", "Propaganda"],
  },
  {
    title: "Keep Tempo While Hitting 4 Life",
    kicker: "Interaction",
    body:
      "The best removal is cheap, flexible, and easy to hold up. You want to answer the table while still setting up an end-step draw trigger.",
    cards: ["Snuff Out", "Void Rend", "Vindicate", "Anguished Unmaking", "Swords to Plowshares"],
  },
  {
    title: "Close Without Becoming Creature Soup",
    kicker: "Finishers",
    body:
      "The deck usually wins by compounding small drains until one spell or lifegain payoff makes the math collapse.",
    cards: ["Exsanguinate", "Papalymo Totolymo", "Emet-Selch of the Third Seat", "Vito, Thorn of the Dusk Rose", "Enduring Tenacity"],
  },
  {
    title: "Protect the Control Shell",
    kicker: "Support",
    body:
      "Mana, protection, and reset buttons matter because Y'shtola is powerful only if you keep playing on everyone else's turn cycle.",
    cards: ["Archaeomancer's Map", "Smothering Tithe", "Teferi's Protection", "Cyclonic Rift", "Deadly Rollick"],
  },
] as const;

const YSHTOLA_BUILD_RULES = [
  {
    label: "Cast threshold spells",
    value: "Noncreature, mana value 3+",
    body: "These are the cards that actually trigger Y'shtola's table drain. Prioritize spells that affect the board, protect you, or refill your hand.",
  },
  {
    label: "Make 4 life happen early",
    value: "Before each end step",
    body: "Her card draw checks as the end step begins. Damage, life loss, and drain need to happen before that window.",
  },
  {
    label: "Avoid fake lifegain",
    value: "Lifegain is a result, not the plan",
    body: "Random lifegain cards make the deck softer. Cards that drain, interact, or double Y'shtola's damage are the real glue.",
  },
] as const;

async function YshtolaLandingShowcase({
  commanderName,
  deckCount,
}: {
  commanderName: string;
  deckCount: number;
}) {
  const packageNames = YSHTOLA_CARD_PACKAGES.flatMap((pack) => pack.cards);
  const detailsMap = await getDetailsForNamesCached(packageNames);
  const visibleDeckCount = deckCount > 0 ? deckCount.toLocaleString() : null;

  return (
    <div className="mb-10 space-y-6">
      <section className="overflow-hidden rounded-2xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),linear-gradient(135deg,rgba(10,10,10,0.98),rgba(23,23,23,0.9))] shadow-2xl shadow-black/40">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">
              Esper spellslinger control
            </p>
            <h2 className="max-w-2xl text-2xl font-bold leading-tight text-white sm:text-3xl">
              The best {commanderName} cards are the ones that make every turn cycle bleed.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300 sm:text-base">
              {"Y'shtola"} is not just an Esper goodstuff commander. She rewards mana value 3+ noncreature spells,
              checks whether a player lost 4 life before each end step, and turns that pressure into cards.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-neutral-200">
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">MV 3+ noncreature spells</span>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5">4 life before end step</span>
              <span className="rounded-full border border-neutral-500/40 bg-neutral-800/70 px-3 py-1.5">Control first, lifegain second</span>
            </div>
          </div>
          <div className="grid gap-3 rounded-xl border border-neutral-700/80 bg-black/30 p-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Community signal</div>
              <div className="mt-1 text-2xl font-bold text-amber-200">
                {visibleDeckCount ? `${visibleDeckCount}+` : "Fast-rising"}
              </div>
              <div className="text-sm text-neutral-400">
                {visibleDeckCount ? "ManaTap tracked deck sample" : "EDHREC and public deck sites show a major Y'shtola spike"}
              </div>
            </div>
            <div className="h-px bg-neutral-800" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Best first upgrade</div>
              <div className="mt-1 text-lg font-semibold text-white">Card-flow engines</div>
              <div className="text-sm text-neutral-400">Curiosity effects, Archmage Emeritus, and clean interaction beat splashy haymakers.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {YSHTOLA_BUILD_RULES.map((rule) => (
          <div key={rule.label} className="rounded-xl border border-neutral-700 bg-neutral-900/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">{rule.label}</div>
            <div className="mt-2 text-base font-semibold text-white">{rule.value}</div>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{rule.body}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-100">{"Best Card Packages for Y'shtola"}</h2>
            <p className="mt-1 text-sm text-neutral-400">Use these as deckbuilding lanes, not just a shopping list.</p>
          </div>
          <Link href="/mtg-commander-ai-deck-builder" className="text-sm font-medium text-cyan-300 hover:text-cyan-100 hover:underline">
            Analyze your list
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {YSHTOLA_CARD_PACKAGES.map((pack) => (
            <article key={pack.title} className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{pack.kicker}</div>
                  <h3 className="mt-1 text-lg font-semibold text-white">{pack.title}</h3>
                </div>
              </div>
              <p className="mb-4 text-sm leading-6 text-neutral-400">{pack.body}</p>
              <div className="grid grid-cols-5 gap-2">
                {pack.cards.map((cardName) => {
                  const details = detailsMap.get(norm(cardName));
                  const imgUrl = details?.image_uris?.small ?? details?.image_uris?.normal;
                  return (
                    <Link
                      key={cardName}
                      href={`/cards/${cardSlug(cardName)}`}
                      title={cardName}
                      className="group min-w-0"
                    >
                      {imgUrl ? (
                        <Image
                          src={imgUrl}
                          alt={cardName}
                          width={146}
                          height={204}
                          sizes="(min-width: 1024px) 72px, 18vw"
                          className="aspect-[5/7] w-full rounded-md border border-neutral-700 object-cover transition group-hover:border-amber-300/70"
                        />
                      ) : (
                        <div className="flex aspect-[5/7] w-full items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-1 text-center text-[10px] leading-tight text-neutral-400">
                          {cardName}
                        </div>
                      )}
                      <div className="mt-1 truncate text-center text-[11px] text-neutral-400 group-hover:text-amber-100">
                        {cardName}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
        <h2 className="text-xl font-semibold text-neutral-100">Upgrade Priority</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["1", "Reliable card flow", "[[Curiosity]], [[Ophidian Eye]], and [[Archmage Emeritus]] make Y'shtola feel unfair."],
            ["2", "Cheap premium answers", "[[Snuff Out]], [[Void Rend]], and [[Anguished Unmaking]] keep you alive without losing tempo."],
            ["3", "Actual closers", "[[Exsanguinate]] and drain payoffs turn control turns into a real win condition."],
          ].map(([step, title, body]) => (
            <div key={step} className="rounded-lg border border-neutral-700/80 bg-black/20 p-4">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-sm font-bold text-amber-100">
                {step}
              </div>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                <GuideInlineText text={body} />
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: BEST_CARDS_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

function breadcrumbJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
      { "@type": "ListItem", position: 3, name, item: `${BASE}/commanders/${slug}` },
      { "@type": "ListItem", position: 4, name: "Best Cards", item: `${BASE}/commanders/${slug}/best-cards` },
    ],
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) return { title: "Not Found | ManaTap" };
  
  // Color identity snippet for richer description
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colors = profile.colors?.map(c => colorNames[c] || c).join("/") || "";
  const colorSnippet = colors ? ` (${colors})` : "";
  
  // Tags for archetype hint
  const archetype = profile.tags?.[0] || "synergy";
  const isYshtola = slug === YSHTOLA_SLUG;
  
  return {
    title: isYshtola
      ? "Y'shtola Best Cards: Esper Spellslinger EDH Upgrade Guide"
      : `Top 50 Best Cards for ${profile.name} | EDH Staples 2026`,
    description: isYshtola
      ? "Best cards for Y'shtola, Night's Blessed Commander: curiosity engines, mana value 3+ noncreature spells, Esper interaction, and real finishers."
      : `Must-have cards for ${profile.name}${colorSnippet} Commander. Essential ramp, card draw, removal & ${archetype} payoffs ranked by win rate. Updated for 2026.`,
    alternates: { canonical: `${BASE}/commanders/${slug}/best-cards` },
    openGraph: {
      title: isYshtola
        ? "Best Cards for Y'shtola, Night's Blessed - ManaTap EDH Guide"
        : `Best Cards for ${profile.name} - EDH/Commander Guide`,
      description: isYshtola
        ? "A hand-built Y'shtola Commander card guide for Esper control, curiosity engines, interaction, and finishers."
        : `Discover the highest win-rate cards for ${profile.name} decks. Includes budget alternatives and synergy breakdowns.`,
      type: "article",
    },
  };
}

export default async function BestCardsPage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) notFound();

  const { name } = profile;
  const content = renderBestCardsContent(profile);
  const focusTags = (profile.tags ?? []).slice(0, 4);
  const traps = (profile.avoid ?? []).slice(0, 3);

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  const [imgMap, aggregates] = await Promise.all([
    getImagesForNamesCached([cleanName]),
    getCommanderAggregates(slug),
  ]);
  const topCards = aggregates?.topCards?.slice(0, 12) ?? [];
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;
  const isYshtola = slug === YSHTOLA_SLUG;

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(slug, name) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commanders" className="hover:text-white">Commanders</Link>
          <span className="mx-2">/</span>
          <Link href={`/commanders/${slug}`} className="hover:text-white">{name}</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Best Cards</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Best Cards for {name}
        </h1>
        {commanderArt && (
          <CommanderArtBanner artUrl={commanderArt} name={name} subtitle="Best Cards" className="mb-6" />
        )}
        <CommanderStatsRibbon profile={profile} aggregates={aggregates} />
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Try tools with this commander</h2>
        <CommanderToolActions
          commanderName={name}
          tools={[
            { href: `/tools/mulligan?commander=${encodeURIComponent(slug)}`, label: "Mulligan Simulator", description: "Simulate keep rates for your opener" },
            { href: `/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`, label: "Cost to Finish", description: "Estimate cost to complete your deck" },
            { href: `/deck/swap-suggestions?commander=${encodeURIComponent(slug)}`, label: "Budget Swaps", description: "Find cheaper alternatives" },
            { href: `/decks/browse?search=${encodeURIComponent(name)}`, label: "Browse Decks", description: `Explore public ${name} decks`, isRecommended: true },
          ]}
        />
        {isYshtola && (
          <YshtolaLandingShowcase commanderName={name} deckCount={aggregates?.deckCount ?? 0} />
        )}
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-5 mb-8">
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">What actually matters in a {name} list</h2>
          <p className="text-neutral-300 leading-relaxed">
            {profile.blurb ?? `${name} rewards a tight, role-based build.`} Start with cards that help the deck function every game, then add narrower payoffs once your ramp, draw, and interaction are already doing their jobs.
          </p>
          {(focusTags.length > 0 || traps.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {focusTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Build Around</h3>
                  <div className="flex flex-wrap gap-2">
                    {focusTags.map((tag) => (
                      <span key={tag} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {traps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Usually Cut First</h3>
                  <ul className="space-y-2 text-sm text-neutral-300">
                    {traps.map((trap) => (
                      <li key={trap}>- {trap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        {topCards.length > 0 && (
          <CoreStaples cards={topCards} commanderName={name} deckCount={aggregates?.deckCount ?? 0} />
        )}
        <div className="space-y-6 text-neutral-300 leading-relaxed">
          {content.map((block, i) => (
            <section key={i}>
              {block.heading && (
                <h2 className="text-xl font-semibold text-neutral-100 mb-3">{block.heading}</h2>
              )}
              <p><GuideInlineText text={block.body} /></p>
            </section>
          ))}
        </div>
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-5 mt-8">
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">Keep moving</h2>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <Link href={`/commanders/${slug}`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">{name} hub</div>
              <div className="text-neutral-400">Overview, stats, decks, and related strategy links.</div>
            </Link>
            <Link href={`/commanders/${slug}/mulligan-guide`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Mulligan guide</div>
              <div className="text-neutral-400">Figure out what openers are worth keeping.</div>
            </Link>
            <Link href={`/commanders/${slug}/budget-upgrades`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Budget upgrades</div>
              <div className="text-neutral-400">Find cheaper improvements without breaking the shell.</div>
            </Link>
          </div>
        </section>
        <h2 className="text-xl font-semibold text-neutral-100 mt-10 mb-3">FAQ</h2>
        <dl className="space-y-3 text-neutral-300">
          {BEST_CARDS_FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-neutral-100">{q}</dt>
              <dd className="ml-0 mt-1 text-sm">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <Link
            href={`/commanders/${slug}`}
            className="text-cyan-400 hover:underline"
          >
            ← Back to {name} commander hub
          </Link>
        </div>
        <RelatedTools
          tools={[
            { href: "/tools/mulligan", label: "Mulligan Simulator" },
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
            { href: "/tools/probability", label: "Probability Calculator" },
            { href: "/price-tracker", label: "Price Tracker" },
          ]}
        />
      </article>
    </main>
  );
}
