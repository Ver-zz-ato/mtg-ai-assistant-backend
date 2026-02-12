/**
 * Single source of truth for Commander SEO content.
 * First 50 commanders ordered by presumed popularity (stable).
 */

import commanderProfiles from "@/lib/data/commander_profiles.json";

export type CommanderProfile = {
  slug: string;
  name: string;
  colors?: string[];
  tags?: string[];
  blurb?: string;
};

/** Convert commander name to URL-safe slug */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Infer color identity from commander name (known commanders) */
const COLOR_MAP: Record<string, string[]> = {
  "theur-dragon": ["W", "U", "B", "R", "G"],
  "edgarmarkov": ["W", "B", "R"],
  "atraxapraetorsvoice": ["W", "U", "B", "G"],
  "krenkomobboss": ["R"],
  "kaaliaofthevast": ["W", "B", "R"],
  "pantlazasunfavored": ["W", "G", "R"],
  "sauronthedarklord": ["U", "B", "R"],
  "yurikothetigersshadow": ["U", "B"],
  "lathrilbladeoftheelves": ["B", "G"],
  "kenriththereturnedking": ["W", "U", "B", "R", "G"],
  "giadafontofhope": ["W"],
  "jodahtheunifier": ["W", "U", "B", "R", "G"],
  "miirymsentinelwyrm": ["U", "R", "G"],
  "thewisemothman": ["U", "B", "G"],
  "nekusarthemindrazer": ["U", "B", "R"],
  "yshtolanightsblessed": ["W", "U", "R"],
  "isshintwoheavensasone": ["W", "B", "R"],
  "hakbalofthesurgingsoul": ["U", "G"],
  "ulalekfusedatrocity": [], // colorless
  "msbumbleflower": ["W", "U", "G"],
  "muldrothathegravetide": ["U", "B", "G"],
  "merenofclanneltoth": ["B", "G"],
  "teysakarlov": ["W", "B"],
  "breyatheetheriumshaper": ["W", "U", "B", "R"],
  "rhystheredeemed": ["G", "W"],
  "sythisharvestshand": ["G", "W"],
  "osgirthereconstructor": ["W", "R"],
  "esixfractalbloom": ["U", "G"],
  "wilhelttherotcleaver": ["W", "B"],
  "korvoldfaecursedking": ["B", "R", "G"],
  "chulanetelleroftales": ["W", "U", "G"],
  "krenkotinstreetkingpin": ["R"],
  "etaliprimalstorm": ["R"],
  "xyristhewrithestorm": ["U", "R", "G"],
  "tivitsellerofsecrets": ["W", "U", "B"],
  "prosshskyraiderofkher": ["B", "R", "G"],
  "aesityrantofthegyrestrait": ["U", "G"],
  "bragokingeternal": ["W", "U"],
  "teferitemporalarchmage": ["U"],
  "dereviempyrialtactician": ["W", "U", "G"],
  "gishathsunsavatar": ["R", "G", "W"],
  "maelstromwanderer": ["U", "R", "G"],
  "sliveroverlord": ["W", "U", "B", "R", "G"],
  "thefirstsliver": ["W", "U", "B", "R", "G"],
  "narsetenlightenedmaster": ["U", "R", "W"],
  "xenagosgodofrevels": ["R", "G"],
  "omnathlocusofcreation": ["W", "U", "R", "G"],
  "omnathlocusofrage": ["R", "G"],
  "aragorntheunifier": ["W", "U", "B", "R", "G"],
  "roccocabaretticaterer": ["W", "R", "G"],
};

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Build COMMANDERS from profiles + extended list */
function buildCommanders(): CommanderProfile[] {
  const profiles = commanderProfiles as Record<
    string,
    { plan?: string; preferTags?: string[]; notes?: string }
  >;
  const fromProfiles = Object.entries(profiles).map(([name, p]) => ({
    slug: toSlug(name),
    name,
    colors: COLOR_MAP[norm(name)] ?? undefined,
    tags: p.preferTags ?? undefined,
    blurb: p.plan ?? undefined,
  }));

  // Additional commanders to reach 50 (popular, stable order)
  const extra: Array<{ name: string; colors?: string[]; tags?: string[]; blurb?: string }> = [
    { name: "Muldrotha, the Gravetide", colors: ["U", "B", "G"], tags: ["graveyard", "recursion"], blurb: "Graveyard recursion and value engines." },
    { name: "Meren of Clan Nel Toth", colors: ["B", "G"], tags: ["graveyard", "sacrifice"], blurb: "Sacrifice and reanimate value." },
    { name: "Teysa Karlov", colors: ["W", "B"], tags: ["aristocrats", "tokens"], blurb: "Death trigger doubling and token aristocrats." },
    { name: "Breya, Etherium Shaper", colors: ["W", "U", "B", "R"], tags: ["artifacts", "combo"], blurb: "Artifact combo and value." },
    { name: "Rhys the Redeemed", colors: ["G", "W"], tags: ["tokens", "elves"], blurb: "Token doubling and elf tribal." },
    { name: "Sythis, Harvest's Hand", colors: ["G", "W"], tags: ["enchantments", "draw"], blurb: "Enchantress draw and value." },
    { name: "Osgir, the Reconstructor", colors: ["W", "R"], tags: ["artifacts", "reanimator"], blurb: "Artifact recursion and copying." },
    { name: "Esix, Fractal Bloom", colors: ["U", "G"], tags: ["tokens", "clones"], blurb: "Token cloning and value." },
    { name: "Wilhelt, the Rotcleaver", colors: ["U", "B"], tags: ["zombies", "tokens"], blurb: "Zombie tribal and decayed tokens." },
    { name: "Korvold, Fae-Cursed King", colors: ["B", "R", "G"], tags: ["sacrifice", "counters"], blurb: "Sacrifice value and card draw." },
    { name: "Chulane, Teller of Tales", colors: ["W", "U", "G"], tags: ["creatures", "ramp"], blurb: "Creature-based ramp and draw." },
    { name: "Krenko, Tin Street Kingpin", colors: ["R"], tags: ["goblins", "tokens"], blurb: "Goblin token swarm." },
    { name: "Etali, Primal Storm", colors: ["R"], tags: ["cascade", "big mana"], blurb: "Primal cascade and free spells." },
    { name: "Xyris, the Writhing Storm", colors: ["U", "R", "G"], tags: ["wheels", "tokens"], blurb: "Wheel-based token generation." },
    { name: "Tivit, Seller of Secrets", colors: ["W", "U", "B"], tags: ["artifacts", "voting"], blurb: "Council voting and artifact value." },
    { name: "Prossh, Skyraider of Kher", colors: ["B", "R", "G"], tags: ["sacrifice", "tokens"], blurb: "Dragon tokens and sacrifice." },
    { name: "Aesi, Tyrant of Gyre Strait", colors: ["U", "G"], tags: ["lands", "draw"], blurb: "Land ramp and extra land drops." },
    { name: "Brago, King Eternal", colors: ["W", "U"], tags: ["blink", "value"], blurb: "Blink and ETB value." },
    { name: "Teferi, Temporal Archmage", colors: ["U"], tags: ["planeswalkers", "control"], blurb: "Planeswalker control and stax." },
    { name: "Derevi, Empyrial Tactician", colors: ["W", "U", "G"], tags: ["taps", "evasion"], blurb: "Tap/untap shenanigans." },
    { name: "Gishath, Sun's Avatar", colors: ["R", "G", "W"], tags: ["dinosaurs", "ramp"], blurb: "Dinosaur tribal and attack triggers." },
    { name: "Maelstrom Wanderer", colors: ["U", "R", "G"], tags: ["cascade", "big mana"], blurb: "Double cascade and haste." },
    { name: "Sliver Overlord", colors: ["W", "U", "B", "R", "G"], tags: ["slivers", "tribal"], blurb: "Sliver tribal and tutoring." },
    { name: "The First Sliver", colors: ["W", "U", "B", "R", "G"], tags: ["slivers", "cascade"], blurb: "Sliver cascade and tribal." },
    { name: "Narset, Enlightened Master", colors: ["U", "R", "W"], tags: ["extra combats", "spells"], blurb: "Extra combats and free spells." },
    { name: "Xenagos, God of Revels", colors: ["R", "G"], tags: ["aggro", "doublestrike"], blurb: "Hasty beaters and double power." },
    { name: "Omnath, Locus of Creation", colors: ["W", "U", "R", "G"], tags: ["lands", "value"], blurb: "Landfall and four-color value." },
    { name: "Omnath, Locus of Rage", colors: ["R", "G"], tags: ["lands", "elementals"], blurb: "Landfall elementals and damage." },
    { name: "Aragorn, the Unifier", colors: ["W", "U", "B", "R", "G"], tags: ["legends", "humans"], blurb: "Legendary human tribal." },
    { name: "Rocco, Cabaretti Caterer", colors: ["W", "R", "G"], tags: ["tutor", "toolbox"], blurb: "Creature tutor and toolbox." },
  ];

  const extraProfiles: CommanderProfile[] = extra.map((e) => ({
    slug: toSlug(e.name),
    name: e.name,
    colors: e.colors,
    tags: e.tags,
    blurb: e.blurb,
  }));

  return [...fromProfiles, ...extraProfiles].slice(0, 50);
}

export const COMMANDERS: CommanderProfile[] = buildCommanders();

export function getCommanderBySlug(slug: string): CommanderProfile | null {
  return COMMANDERS.find((c) => c.slug === slug) ?? null;
}

export function getFirst50CommanderSlugs(): string[] {
  return COMMANDERS.map((c) => c.slug);
}
