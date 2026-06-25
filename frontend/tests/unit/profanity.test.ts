import { containsProfanity } from "../../lib/profanity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(!containsProfanity("1 Thirst for Identity"), "deck line should not be flagged");
  assert(!containsProfanity("Thirst for Identity"), "card name should not be flagged");
  assert(containsProfanity("bad shit"), "standalone profanity should be flagged");
  assert(containsProfanity("f u c k"), "obfuscated profanity should be flagged");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
