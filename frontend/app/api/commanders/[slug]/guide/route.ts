import { NextResponse } from "next/server";
import { getCommanderBySlug } from "@/lib/commanders";
import {
  renderCommanderIntro,
  renderMulliganGuideContent,
  renderBestCardsContent,
  renderBudgetUpgradesContent,
  renderHowDeckWins,
  renderCommonMistakes,
  deriveCommanderSnapshot,
  MULLIGAN_FAQ,
  BEST_CARDS_FAQ,
  BUDGET_FAQ,
} from "@/lib/seo/commander-content";
import {
  mergeCommanderGuideFaqs,
  buildMobileGuideSections,
  renderElevatorPitch,
  renderStrengthsLine,
  renderWeaknessesLine,
  renderUpgradePrioritiesLine,
  renderMulliganHeuristicsShort,
} from "@/lib/guide-api-assembler";
import { getCommanderAggregates } from "@/lib/commander-aggregates";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import {
  buildCommanderIdentityCard,
  buildCommunityBlock,
  buildHubSectionsVisual,
} from "@/lib/guide-hub-phase2";
import {
  buildFlagshipGuidePayload,
  buildIntentActionsForGuide,
  enhanceCommunityBlockForFlagship,
} from "@/lib/guide-flagship";

/** GET /api/commanders/[slug]/guide — JSON guide content for native mobile app */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const profile = getCommanderBySlug(slug);
    if (!profile) {
      return NextResponse.json({ error: "Commander not found" }, { status: 404 });
    }

    const snapshot = deriveCommanderSnapshot(profile);
    const cleanName = profile.name.replace(/\s*\(.*?\)\s*$/, "").trim();
    const norm = (s: string) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const [imgMap, aggregates] = await Promise.all([
      getImagesForNamesCached([cleanName]).catch(() => new Map()),
      getCommanderAggregates(slug).catch(() => null),
    ]);

    const cmdImg = imgMap.get(norm(cleanName));
    const artUrl =
      cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small || null;

    const mergedFaq = mergeCommanderGuideFaqs();

    const medianUsd =
      aggregates?.medianDeckCost != null && aggregates.medianDeckCost > 0
        ? Math.round(aggregates.medianDeckCost)
        : null;

    const commanderIdentity = buildCommanderIdentityCard(profile, snapshot, medianUsd);
    const intentActions = buildIntentActionsForGuide(profile);
    const hubSectionsVisual = buildHubSectionsVisual(profile);
    const communityBase = buildCommunityBlock(
      aggregates?.deckCount,
      aggregates?.recentDecks,
    );
    const communityPresentation = enhanceCommunityBlockForFlagship(
      profile,
      communityBase,
      aggregates,
    );
    const flagshipContent = buildFlagshipGuidePayload(profile, aggregates);

    const guide = {
      profile: {
        slug: profile.slug,
        name: profile.name,
        colors: profile.colors,
        tags: profile.tags,
        blurb: profile.blurb,
      },
      intro: renderCommanderIntro(profile, "hub"),
      snapshot: {
        gameplan: snapshot.gameplan,
        powerStyle: snapshot.powerStyle,
        difficulty: snapshot.difficulty,
      },
      /** Short summary for mobile hero — prefer blurb/plan, else strategy snapshot. */
      elevatorPitch: renderElevatorPitch(profile),
      strengths: renderStrengthsLine(profile),
      weaknesses: renderWeaknessesLine(profile),
      upgradePriorities: renderUpgradePrioritiesLine(profile),
      mulliganHeuristics: renderMulliganHeuristicsShort(profile),
      /** Modular sections for Commander Hub (prose vs block groups). Legacy fields below stay for older app builds. */
      sections: buildMobileGuideSections(profile),
      faq: mergedFaq,
      meta: {
        guideTier: profile.guideTier ?? "standard",
        featuredGuide: profile.featuredGuide ?? false,
        hasGuide: profile.hasGuide !== false,
        isFlagshipGuide: profile.guideTier === "flagship",
      },
      /** Phase 2 — structured identity (additive; hide empty client-side). */
      commanderIdentity,
      /** Phase 2 — compact “what do you want to do?” (client maps ids to deep links). */
      intentActions,
      /** Phase 2 — scan-first section shapes; legacy `sections` + long-form fields remain for compatibility. */
      hubSectionsVisual,
      /** Phase 2 — richer copy + recency labels for the community block (optional). */
      communityPresentation,
      /** Flagship program — premium editorial modules (null when not flagship). */
      flagshipContent,
      howDeckWins: renderHowDeckWins(profile),
      commonMistakes: renderCommonMistakes(profile),
      mulliganGuide: renderMulliganGuideContent(profile),
      bestCards: renderBestCardsContent(profile),
      budgetUpgrades: renderBudgetUpgradesContent(profile),
      mulliganFaq: MULLIGAN_FAQ,
      bestCardsFaq: BEST_CARDS_FAQ,
      budgetFaq: BUDGET_FAQ,
      aggregates: aggregates
        ? {
            deckCount: aggregates.deckCount ?? 0,
            medianDeckCostUSD:
              aggregates.medianDeckCost != null && aggregates.medianDeckCost > 0
                ? Math.round(aggregates.medianDeckCost)
                : null,
            topCards: (aggregates.topCards ?? []).slice(0, 12),
            recentDecks: aggregates.recentDecks ?? [],
          }
        : null,
      /** Top staples as simple names (tappable in app). Mirrors aggregates.topCards when present. */
      staples:
        aggregates?.topCards?.map((c) => ({
          name: c.cardName,
          count: c.count,
          percent: c.percent,
        })) ?? [],
      recentDecks: aggregates?.recentDecks ?? [],
      artUrl,
    };

    return NextResponse.json(guide);
  } catch (e) {
    console.error("[commanders/guide]", e);
    return NextResponse.json(
      { error: "Failed to load guide" },
      { status: 500 }
    );
  }
}
