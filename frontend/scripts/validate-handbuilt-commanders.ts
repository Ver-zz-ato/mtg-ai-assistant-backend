import { COMMANDERS } from "../lib/commanders";
import { HAND_BUILT_COMMANDER_GUIDES } from "../lib/data/commander-handbuilt-guides";
import { getCommanderShowcase } from "../lib/seo/commander-showcases";

const requiredFlagshipFields = [
  "loveReason",
  "bestFor",
  "winPaths",
  "traps",
  "upgradePriority",
  "openingPlan",
  "tableReputation",
  "communityHeadline",
  "communitySubhead",
] as const;

const failures: string[] = [];

for (const commander of COMMANDERS) {
  const guide = HAND_BUILT_COMMANDER_GUIDES[commander.slug];
  if (!guide) failures.push(`${commander.slug}: missing hand-built guide seed`);
  if (commander.guideTier !== "flagship") failures.push(`${commander.slug}: guideTier is not flagship`);
  if (!commander.flagship) {
    failures.push(`${commander.slug}: missing flagship content`);
  } else {
    for (const field of requiredFlagshipFields) {
      const value = commander.flagship[field];
      if (Array.isArray(value)) {
        if (value.length === 0) failures.push(`${commander.slug}: flagship.${field} is empty`);
      } else if (!String(value ?? "").trim()) {
        failures.push(`${commander.slug}: flagship.${field} is empty`);
      }
    }
  }

  for (const pageType of ["best-cards", "budget-upgrades"] as const) {
    const showcase = getCommanderShowcase(commander.slug, pageType);
    if (!showcase) {
      failures.push(`${commander.slug}: missing ${pageType} showcase`);
      continue;
    }
    if (showcase.rules.length !== 3) failures.push(`${commander.slug}: ${pageType} should have 3 rules`);
    if (showcase.packages.length !== 4) failures.push(`${commander.slug}: ${pageType} should have 4 packages`);
    for (const pack of showcase.packages) {
      if (pack.cards.length < 4) failures.push(`${commander.slug}: ${pageType}/${pack.title} has fewer than 4 cards`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Validated ${COMMANDERS.length} hand-built commander guides and ${COMMANDERS.length * 2} showcase pages.`);
