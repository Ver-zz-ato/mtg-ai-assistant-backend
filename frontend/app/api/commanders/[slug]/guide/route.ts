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
import { getCommanderAggregates } from "@/lib/commander-aggregates";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

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
          }
        : null,
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
