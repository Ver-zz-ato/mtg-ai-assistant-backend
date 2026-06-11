export type DraftQualityFlag =
  | "too_salesy"
  | "fake_personal_claim"
  | "astroturf_risk"
  | "spammy_cta"
  | "manatap_overmention"
  | "thin_mtg_content"
  | "too_generic"
  | "reddit_hostile";

export function checkDraftQuality(content: string, platform: string): DraftQualityFlag[] {
  const flags = new Set<DraftQualityFlag>();
  const lower = content.toLowerCase();
  const manatapCount = (content.match(/manatap/gi) ?? []).length;
  const hashtagCount = (content.match(/#/g) ?? []).length;
  const linkCount = (content.match(/https?:\/\//gi) ?? []).length;

  if (/\b(buy now|limited time|sign up today|don't miss|act fast)\b/i.test(content)) {
    flags.add("too_salesy");
  }
  if (/\b(i just discovered|as a random player|fellow planeswalker here|not affiliated but)\b/i.test(lower)) {
    flags.add("fake_personal_claim");
  }
  if (
    manatapCount >= 1 &&
    /\b(check out|you should try|game changer)\b/i.test(lower) &&
    platform === "reddit"
  ) {
    flags.add("astroturf_risk");
  }
  if (hashtagCount > 5 || linkCount > 2) {
    flags.add("spammy_cta");
  }
  if (manatapCount > 2 && (platform === "x" || content.length < 320)) {
    flags.add("manatap_overmention");
  }

  const mtgTerms =
    /\b(commander|edh|deck|mana|sol ring|counterspell|tournament|sideboard|mulligan|card)\b/i;
  if (content.length > 120 && !mtgTerms.test(lower)) {
    flags.add("thin_mtg_content");
  }
  if (/\b(in today's fast-paced world|excited to share|hot take:|thoughts\?)\b/i.test(lower)) {
    flags.add("too_generic");
  }
  if (platform === "reddit") {
    if (/\b(check out my|dm me|link in bio|follow me)\b/i.test(lower)) {
      flags.add("reddit_hostile");
    }
  }

  return [...flags];
}
