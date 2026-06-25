import {
  containsProfanity,
  containsProfanityOutsideLikelyDecklist,
  containsSevereChatAbuseOutsideLikelyDecklist,
} from "../../lib/profanity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(!containsProfanity("1 Thirst for Identity"), "deck line should not be flagged");
  assert(!containsProfanity("Thirst for Identity"), "card name should not be flagged");
  assert(containsProfanity("bad shit"), "standalone profanity should be flagged");
  assert(containsProfanity("f u c k"), "obfuscated profanity should be flagged");

  const promptWithDecklist = [
    "Can you suggest cards to remove for these additions?",
    "1 Sol Ring",
    "1 Arcane Signet",
    "1 Command Tower",
    "1 Forest",
    "1 Plains",
    "1 Swamp",
    "1 Island",
    "1 Mountain",
    "1 Shithead",
  ].join("\n");

  assert(containsProfanity(promptWithDecklist), "full prompt should still contain profanity before decklist stripping");
  assert(!containsProfanityOutsideLikelyDecklist(promptWithDecklist), "chat decklist rows should not trigger profanity block");

  const promptWithProfaneProse = [
    "Can you fix this shit deck?",
    "1 Sol Ring",
    "1 Arcane Signet",
    "1 Command Tower",
    "1 Forest",
    "1 Plains",
    "1 Swamp",
    "1 Island",
    "1 Mountain",
  ].join("\n");

  assert(containsProfanityOutsideLikelyDecklist(promptWithProfaneProse), "strict public-style helper should still flag profanity");
  assert(!containsSevereChatAbuseOutsideLikelyDecklist(promptWithProfaneProse), "private chat helper should allow general profanity");

  const promptWithAbusiveProse = [
    "Can you fix this retard deck?",
    "1 Sol Ring",
    "1 Arcane Signet",
    "1 Command Tower",
    "1 Forest",
    "1 Plains",
    "1 Swamp",
    "1 Island",
    "1 Mountain",
  ].join("\n");

  assert(containsSevereChatAbuseOutsideLikelyDecklist(promptWithAbusiveProse), "private chat helper should still block severe abuse");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
