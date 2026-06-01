import Image from "next/image";
import Link from "next/link";
import CardDetailLink from "@/components/cards/CardDetailLink";
import type { CommanderLandingShowcaseContent } from "@/lib/seo/commander-showcases";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { GuideInlineText } from "@/components/commander/GuideInlineText";

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Props = {
  showcase: CommanderLandingShowcaseContent;
  deckCount: number;
};

export async function CommanderLandingShowcase({ showcase, deckCount }: Props) {
  const packageNames = showcase.packages.flatMap((pack) => pack.cards);
  const detailsMap = await getDetailsForNamesCached(packageNames);
  const hasUsefulDeckCount = deckCount >= 100;
  const signalValue =
    showcase.communitySignal.useDeckCount && hasUsefulDeckCount
      ? `${deckCount.toLocaleString()}+`
      : showcase.communitySignal.value;
  const signalBody =
    showcase.communitySignal.useDeckCount && hasUsefulDeckCount
      ? "ManaTap tracked deck sample"
      : showcase.communitySignal.body;

  return (
    <div className="mb-10 space-y-6">
      <section className="overflow-hidden rounded-2xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),linear-gradient(135deg,rgba(10,10,10,0.98),rgba(23,23,23,0.9))] shadow-2xl shadow-black/40">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">
              {showcase.kicker}
            </p>
            <h2 className="max-w-2xl text-2xl font-bold leading-tight text-white sm:text-3xl">
              {showcase.headline}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300 sm:text-base">
              {showcase.intro}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-neutral-200">
              {showcase.pills.map((pill, index) => (
                <span
                  key={pill}
                  className={`rounded-full border px-3 py-1.5 ${
                    index === 0
                      ? "border-amber-400/30 bg-amber-400/10"
                      : index === 1
                        ? "border-cyan-400/30 bg-cyan-400/10"
                        : "border-neutral-500/40 bg-neutral-800/70"
                  }`}
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 rounded-xl border border-neutral-700/80 bg-black/30 p-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Community signal</div>
              <div className="mt-1 text-2xl font-bold text-amber-200">{signalValue}</div>
              <div className="text-sm text-neutral-400">{signalBody}</div>
            </div>
            <div className="h-px bg-neutral-800" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Best first upgrade</div>
              <div className="mt-1 text-lg font-semibold text-white">{showcase.firstUpgrade.title}</div>
              <div className="text-sm text-neutral-400">{showcase.firstUpgrade.body}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {showcase.rules.map((rule) => (
          <div key={rule.label} className="rounded-xl border border-neutral-700 bg-neutral-900/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              {rule.label}
            </div>
            <div className="mt-2 text-base font-semibold text-white">{rule.value}</div>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{rule.body}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-100">{showcase.packagesTitle}</h2>
            <p className="mt-1 text-sm text-neutral-400">{showcase.packagesSubtitle}</p>
          </div>
          <Link href={showcase.ctaHref} className="text-sm font-medium text-cyan-300 hover:text-cyan-100 hover:underline">
            {showcase.ctaLabel}
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {showcase.packages.map((pack) => (
            <article key={pack.title} className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                  {pack.kicker}
                </div>
                <h3 className="mt-1 text-lg font-semibold text-white">{pack.title}</h3>
              </div>
              <p className="mb-4 text-sm leading-6 text-neutral-400">{pack.body}</p>
              <div className="grid grid-cols-5 gap-2">
                {pack.cards.map((cardName) => {
                  const details = detailsMap.get(norm(cardName));
                  const imageSmall = details?.image_uris?.small;
                  const imageNormal = details?.image_uris?.normal;
                  const imgUrl = imageSmall ?? imageNormal;
                  return (
                    <CardDetailLink
                      key={cardName}
                      cardName={cardName}
                      imageSmall={imageSmall}
                      imageNormal={imageNormal}
                      title={cardName}
                      className="group block w-full min-w-0 text-left"
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
                    </CardDetailLink>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
        <h2 className="text-xl font-semibold text-neutral-100">{showcase.priorityTitle}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {showcase.priorities.map((priority) => (
            <div key={priority.step} className="rounded-lg border border-neutral-700/80 bg-black/20 p-4">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-sm font-bold text-amber-100">
                {priority.step}
              </div>
              <h3 className="font-semibold text-white">{priority.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                <GuideInlineText text={priority.body} />
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
