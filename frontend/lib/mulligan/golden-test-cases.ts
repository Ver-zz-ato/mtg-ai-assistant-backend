/**
 * Golden test cases for Mulligan AI Advice QA.
 * Prefilled decks + example hands for manual testing.
 */

export type GoldenTestCase = {
  id: string;
  label: string;
  decklist: string;
  commander: string;
  hands: string[][];
};

export const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  {
    id: "turbo_combo_bant",
    label: "Turbo combo (Bant Kinnan/Kitten shell)",
    commander: "Kinnan, Bonder Prodigy",
    decklist: `1 Sol Ring
1 Mana Crypt
1 Mana Vault
1 Chrome Mox
1 Mox Diamond
1 Jeweled Lotus
1 Arcane Signet
1 Talisman of Curiosity
1 Talisman of Progress
1 Llanowar Elves
1 Birds of Paradise
1 Noble Hierarch
1 Demonic Tutor
1 Mystical Tutor
1 Worldly Tutor
1 Enlightened Tutor
1 Green Sun's Zenith
1 Rhystic Study
1 Mystic Remora
1 Force of Will
1 Force of Negation
1 Swan Song
1 Swords to Plowshares
1 Cyclonic Rift
1 Teferi's Protection
1 Kinnan, Bonder Prodigy
1 Thrasios, Triton Hero
1 Tymna the Weaver
1 Dockside Extortionist
1 Peregrine Drake
1 Deadeye Navigator
1 Seedborn Muse
1 Hullbreaker Horror
36 Island
10 Forest
8 Plains`,
    hands: [
      ["Island", "Forest", "Sol Ring", "Arcane Signet", "Rhystic Study", "Force of Will", "Kinnan, Bonder Prodigy"],
      ["Island", "Island", "Mana Crypt", "Chrome Mox", "Demonic Tutor", "Peregrine Drake", "Hullbreaker Horror"],
      ["Forest", "Plains", "Birds of Paradise", "Swords to Plowshares", "Teferi's Protection", "Seedborn Muse", "Thrasios, Triton Hero"],
      // TRAP: 3 lands + big value + no accel/tutor — keepable in casual, wrong in turbo
      ["Island", "Forest", "Plains", "Hullbreaker Horror", "Seedborn Muse", "Teferi's Protection", "Thrasios, Triton Hero"],
    ],
  },
  {
    id: "midrange_value",
    label: "Midrange value (landfall-ish)",
    commander: "Tatyova, Benthic Druid",
    decklist: `1 Sol Ring
1 Arcane Signet
1 Kodama's Reach
1 Cultivate
1 Rampant Growth
1 Farseek
1 Nature's Lore
1 Three Visits
1 Llanowar Elves
1 Birds of Paradise
1 Rhystic Study
1 Mystic Remora
1 Sylvan Library
1 Kami of the Crescent Moon
1 Harmonize
1 Beast Within
1 Cyclonic Rift
1 Counterspell
1 Tatyova, Benthic Druid
1 Oracle of Mul Daya
1 Azusa, Lost but Seeking
1 Exploration
1 Burgeoning
1 Crucible of Worlds
1 Ramunap Excavator
1 Scute Swarm
1 Avenger of Zendikar
1 Craterhoof Behemoth
38 Forest
12 Island
8 Plains`,
    hands: [
      ["Forest", "Island", "Forest", "Rhystic Study", "Kami of the Crescent Moon", "Tatyova, Benthic Druid", "Cultivate"],
      ["Forest", "Forest", "Sol Ring", "Rampant Growth", "Oracle of Mul Daya", "Beast Within", "Avenger of Zendikar"],
      ["Island", "Forest", "Plains", "Arcane Signet", "Sylvan Library", "Counterspell", "Exploration"],
      // TRAP: 2 lands + 2 ramp + no payoff — keeps spinning wheels
      ["Forest", "Island", "Rampant Growth", "Cultivate", "Kodama's Reach", "Farseek", "Nature's Lore"],
    ],
  },
  {
    id: "control_heavy",
    label: "Control-heavy (lots of interaction)",
    commander: "Grand Arbiter Augustin IV",
    decklist: `1 Sol Ring
1 Arcane Signet
1 Azorius Signet
1 Talisman of Progress
1 Rhystic Study
1 Mystic Remora
1 Esper Sentinel
1 Consecrated Sphinx
1 Fact or Fiction
1 Force of Will
1 Force of Negation
1 Counterspell
1 Mana Drain
1 Swan Song
1 An Offer You Can't Refuse
1 Swords to Plowshares
1 Path to Exile
1 Cyclonic Rift
1 Teferi's Protection
1 Grand Abolisher
1 Teferi, Time Raveler
1 Grand Arbiter Augustin IV
1 Smothering Tithe
1 Dovin's Veto
1 Negate
1 Mana Tithe
1 Remand
1 Mana Leak
34 Island
12 Plains
8 Fetch lands`,
    hands: [
      ["Island", "Plains", "Island", "Rhystic Study", "Force of Will", "Swords to Plowshares", "Grand Arbiter Augustin IV"],
      ["Island", "Island", "Plains", "Mystic Remora", "Counterspell", "Cyclonic Rift", "Teferi, Time Raveler"],
      ["Island", "Plains", "Arcane Signet", "Esper Sentinel", "An Offer You Can't Refuse", "Dovin's Veto", "Consecrated Sphinx"],
      // TRAP: 1 land + 3 counters + no draw — looks interactive but dies
      ["Island", "Force of Will", "Counterspell", "Swan Song", "Grand Arbiter Augustin IV", "Smothering Tithe", "Dovin's Veto"],
    ],
  },
];
