import {
  PUBLIC_DECK_TITLE_QUALITY_ERROR,
  getPublicDeckValidationError,
  isLowQualityPublicDeckTitle,
} from "../../lib/deck/publicDeckValidation";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const VALID_DECK_TEXT = "60 Island";
const VALID_DECK_AIM = "Tempo plan with early interaction and evasive threats.";

function publicErrorForTitle(title: string): string | null {
  return getPublicDeckValidationError({
    title,
    format: "Standard",
    deckText: VALID_DECK_TEXT,
    deckAim: VALID_DECK_AIM,
  });
}

async function main() {
  const validTitles = ["Alela Faerie Control", "Rakdos Sacrifice Midrange", "Budget Yuriko Tempo"];
  for (const title of validTitles) {
    assert(!isLowQualityPublicDeckTitle(title), `${title} should pass title quality`);
    assert(publicErrorForTitle(title) === null, `${title} should pass public validation`);
  }

  const badTitles = [
    "Untitled",
    "Untitled Deck",
    "Commander Name AI",
    "deck from collection AI",
    "deck frfom collection AI",
    "My Deck",
    "Test",
    "Deck",
  ];
  for (const title of badTitles) {
    assert(isLowQualityPublicDeckTitle(title), `${title} should fail title quality`);
    assert(publicErrorForTitle(title) === PUBLIC_DECK_TITLE_QUALITY_ERROR, `${title} should fail public validation`);
  }

  assert(
    publicErrorForTitle("Shitstorm Control") === "Please remove offensive language before making this public.",
    "profanity still fails after title quality passes",
  );

  assert(
    getPublicDeckValidationError({
      title: "Rakdos Sacrifice Midrange",
      format: "Standard",
      deckText: VALID_DECK_TEXT,
      deckAim: "",
    }) === "Add a deck aim / strategy before making this public.",
    "required deck aim still fails",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
