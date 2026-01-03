// backend/scripts/add-public-decks.js
// Script to add 200+ public Commander decks to the database
// Generates realistic 100-card decklists with multiple variants per commander

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Popular commanders with multiple archetype variants
const COMMANDER_VARIANTS = [
  // 2025 Popular
  { name: "Yshtola, Nights Blessed", colors: ['W', 'U', 'B', 'R'], archetypes: ['Spellslinger', 'Control', 'Combo'] },
  { name: "Vivi Ornitier", colors: ['U', 'R'], archetypes: ['Wizard Tribal', 'Spellslinger', 'Burn'] },
  { name: "Teval, the Balanced Scale", colors: ['U', 'B', 'G'], archetypes: ['Graveyard', 'Reanimator', 'Value'] },
  { name: "Kefka, Court Mage", colors: ['U', 'B', 'R'], archetypes: ['Chaos', 'Spellslinger', 'Combo'] },
  { name: "Sephiroth, Fabled SOLDIER", colors: ['W', 'B'], archetypes: ['Voltron', 'Aggro', 'Control'] },
  { name: "Fire Lord Azula", colors: ['U', 'R'], archetypes: ['Burn', 'Spellslinger', 'Aggro'] },
  
  // Classic Popular - Multiple variants each
  { name: "Atraxa, Praetors Voice", colors: ['W', 'U', 'B', 'G'], archetypes: ['Superfriends', 'Counters', 'Infect', 'Proliferate', 'Control'] },
  { name: "Atraxa, Grand Unifier", colors: ['W', 'U', 'B', 'G'], archetypes: ['Goodstuff', 'Control', 'Value', 'Toolbox'] },
  { name: "The Ur-Dragon", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Dragon Tribal', 'Big Mana', 'Ramp', 'Aggro', 'Control', 'Combo', 'Goodstuff', 'Stompy'] },
  { name: "Edgar Markov", colors: ['W', 'B', 'R'], archetypes: ['Vampire Tribal', 'Aggro', 'Tokens', 'Aristocrats', 'Midrange', 'Control'] },
  { name: "Yuriko, the Tigers Shadow", colors: ['U', 'B'], archetypes: ['Ninja Tribal', 'Topdeck', 'Tempo', 'Combo', 'Control'] },
  { name: "Krenko, Mob Boss", colors: ['R'], archetypes: ['Goblin Tribal', 'Tokens', 'Aggro', 'Combo', 'Storm'] },
  { name: "Krenko, Tin Street Kingpin", colors: ['R'], archetypes: ['Goblin Tribal', 'Aggro', 'Tokens'] },
  { name: "Meren of Clan Nel Toth", colors: ['B', 'G'], archetypes: ['Reanimator', 'Graveyard', 'Value', 'Control', 'Combo'] },
  { name: "Chulane, Teller of Tales", colors: ['W', 'U', 'G'], archetypes: ['Bounce', 'Landfall', 'Combo', 'Value'] },
  { name: "Korvold, Fae-Cursed King", colors: ['B', 'R', 'G'], archetypes: ['Sacrifice', 'Treasure', 'Food', 'Aristocrats'] },
  { name: "Korvold, Gleeful Glutton", colors: ['B', 'R', 'G'], archetypes: ['Food', 'Tokens', 'Value', 'Combo'] },
  { name: "Prosper, Tome-Bound", colors: ['B', 'R'], archetypes: ['Exile', 'Treasure', 'Storm'] },
  { name: "Kenrith, the Returned King", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Politics', 'Goodstuff', 'Combo', 'Control', 'Reanimator'] },
  { name: "Ghave, Guru of Spores", colors: ['W', 'B', 'G'], archetypes: ['Combo', 'Tokens', 'Counters', 'Value'] },
  { name: "Muldrotha, the Gravetide", colors: ['B', 'G', 'U'], archetypes: ['Graveyard', 'Value', 'Control', 'Combo', 'Lands'] },
  { name: "Breya, Etherium Shaper", colors: ['W', 'U', 'B', 'R'], archetypes: ['Artifacts', 'Combo', 'Control', 'Tokens', 'Value'] },
  { name: "Yawgmoth, Thran Physician", colors: ['B'], archetypes: ['Aristocrats', 'Combo', 'Control', 'Value'] },
  { name: "The Gitrog Monster", colors: ['B', 'G'], archetypes: ['Lands', 'Combo', 'Value', 'Control'] },
  { name: "Kess, Dissident Mage", colors: ['U', 'B', 'R'], archetypes: ['Spellslinger', 'Storm', 'Combo', 'Control'] },
  { name: "Thrasios, Triton Hero", colors: ['U', 'G'], archetypes: ['Control', 'Combo', 'Value'] },
  { name: "Tymna the Weaver", colors: ['W', 'B'], archetypes: ['Aggro', 'Control', 'Value', 'Midrange'] },
  { name: "Najeela, the Blade-Blossom", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Warrior Tribal', 'Aggro', 'Combo', 'Tokens'] },
  { name: "Miirym, Sentinel Wyrm", colors: ['U', 'R', 'G'], archetypes: ['Dragon Tribal', 'Value', 'Stompy', 'Control'] },
  { name: "Kinnan, Bonder Prodigy", colors: ['U', 'G'], archetypes: ['Ramp', 'Combo', 'Big Mana', 'Artifacts'] },
  { name: "Niv-Mizzet, Parun", colors: ['U', 'R'], archetypes: ['Spellslinger', 'Draw', 'Combo', 'Control'] },
  { name: "Niv-Mizzet, the Firemind", colors: ['U', 'R'], archetypes: ['Draw', 'Combo'] },
  { name: "Niv-Mizzet, Dracogenius", colors: ['U', 'R'], archetypes: ['Control'] },
  { name: "Niv-Mizzet, Supreme", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Control'] },
  { name: "Jodah, Archmage Eternal", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Big Spells', 'Cascade', 'Goodstuff', 'Control'] },
  { name: "Jodah, the Unifier", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Legendary Tribal', 'Aggro', 'Midrange', 'Value'] },
  
  // More Popular Commanders
  { name: "Kaalia of the Vast", colors: ['W', 'B', 'R'], archetypes: ['Angels Demons Dragons', 'Aggro', 'Stompy'] },
  { name: "Sisay, Weatherlight Captain", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Legendary Tribal', 'Toolbox', 'Combo'] },
  { name: "Zur the Enchanter", colors: ['W', 'U', 'B'], archetypes: ['Voltron', 'Stax', 'Control'] },
  { name: "Narset, Enlightened Master", colors: ['U', 'R', 'W'], archetypes: ['Extra Turns', 'Spellslinger', 'Combo'] },
  { name: "Omnath, Locus of Creation", colors: ['W', 'U', 'R', 'G'], archetypes: ['Landfall', 'Value', 'Combo'] },
  { name: "Omnath, Locus of Rage", colors: ['R', 'G'], archetypes: ['Elementals', 'Landfall', 'Tokens'] },
  { name: "Omnath, Locus of Mana", colors: ['G'], archetypes: ['Big Mana', 'Ramp', 'Stompy'] },
  { name: "Omnath, Locus of All", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['5-Color', 'Goodstuff', 'Control'] },
  { name: "Jhoira, Weatherlight Captain", colors: ['U', 'R'], archetypes: ['Artifacts', 'Combo', 'Storm'] },
  { name: "Jhoira of the Ghitu", colors: ['U', 'R'], archetypes: ['Suspend', 'Big Spells', 'Control'] },
  { name: "Sliver Overlord", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Sliver Tribal', 'Toolbox', 'Combo'] },
  { name: "The First Sliver", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Cascade', 'Sliver Tribal', 'Combo'] },
  { name: "Sliver Hivelord", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Indestructible', 'Sliver Tribal', 'Stompy'] },
  { name: "Sliver Queen", colors: ['W', 'U', 'B', 'R', 'G'], archetypes: ['Tokens', 'Sliver Tribal', 'Combo'] },
  { name: "Aesi, Tyrant of Gyre Strait", colors: ['U', 'G'], archetypes: ['Lands', 'Landfall', 'Value'] },
  { name: "Tatyova, Benthic Druid", colors: ['U', 'G'], archetypes: ['Landfall', 'Value', 'Control'] },
  { name: "Arixmethes, Slumbering Isle", colors: ['U', 'G'], archetypes: ['Sea Monsters', 'Ramp', 'Stompy'] },
  { name: "Koma, Cosmos Serpent", colors: ['U', 'G'], archetypes: ['Control', 'Stompy', 'Tokens'] },
  { name: "Jin-Gitaxias, Progress Tyrant", colors: ['U'], archetypes: ['Artifacts', 'Control', 'Combo'] },
  { name: "Vorinclex, Monstrous Raider", colors: ['G'], archetypes: ['Counters', 'Ramp', 'Stompy'] },
  { name: "Elesh Norn, Grand Cenobite", colors: ['W'], archetypes: ['Tokens', 'Stax', 'Control'] },
  { name: "Sheoldred, Whispering One", colors: ['B'], archetypes: ['Reanimator', 'Control', 'Value'] },
  { name: "Urabrask the Hidden", colors: ['R'], archetypes: ['Haste', 'Aggro', 'Stompy'] },
  { name: "Jin-Gitaxias, Core Augur", colors: ['U'], archetypes: ['Draw', 'Control', 'Combo'] },
  { name: "Vorinclex, Voice of Hunger", colors: ['G'], archetypes: ['Ramp', 'Stompy', 'Control'] },
  { name: "Elesh Norn, Mother of Machines", colors: ['W'], archetypes: ['Blink', 'Value', 'Control'] },
  { name: "Sheoldred, the Apocalypse", colors: ['B'], archetypes: ['Draw', 'Control', 'Value'] },
  { name: "Urabrask, Heretic Praetor", colors: ['R'], archetypes: ['Exile', 'Aggro', 'Combo'] },
  
  // Even More Popular Commanders
  { name: "Lathril, Blade of the Elves", colors: ['B', 'G'], archetypes: ['Elf Tribal', 'Tokens', 'Combo'] },
  { name: "Wilhelt, the Rotcleaver", colors: ['U', 'B'], archetypes: ['Zombie Tribal', 'Aristocrats', 'Tokens'] },
  { name: "Liesa, Shroud of Dusk", colors: ['W', 'B'], archetypes: ['Lifegain', 'Control', 'Stax'] },
  { name: "Liesa, Forgotten Archangel", colors: ['W', 'B'], archetypes: ['Reanimator', 'Value', 'Control'] },
  { name: "Liesa, Dawn of Hope", colors: ['W'], archetypes: ['Angels', 'Lifegain', 'Control'] },
  { name: "Kardur, Doomscourge", colors: ['B', 'R'], archetypes: ['Goad', 'Politics', 'Chaos'] },
  { name: "Rin and Seri, Inseparable", colors: ['R', 'G', 'W'], archetypes: ['Cat Dog Tribal', 'Tokens', 'Aggro'] },
  { name: "Jirina Kudro", colors: ['W', 'B', 'R'], archetypes: ['Human Tribal', 'Aggro', 'Tokens'] },
  { name: "Jirina, Dauntless General", colors: ['W', 'B', 'R'], archetypes: ['Aggro', 'Tokens', 'Midrange'] },
  { name: "Jirina, Voiced of Zhalfir", colors: ['W', 'U', 'B'], archetypes: ['Control', 'Value', 'Midrange'] },
  { name: "Zaxara, the Exemplary", colors: ['U', 'B', 'G'], archetypes: ['Hydra Tribal', 'X Spells', 'Combo'] },
  { name: "Kalamax, the Stormsire", colors: ['U', 'R', 'G'], archetypes: ['Spellslinger', 'Copy', 'Combo'] },
  { name: "Gavi, Nest Warden", colors: ['W', 'U', 'R'], archetypes: ['Cycling', 'Tokens', 'Control', 'Combo'] },
  { name: "Obeka, Brute Chronologist", colors: ['U', 'B', 'R'], archetypes: ['End Step', 'Reanimator', 'Combo'] },
  { name: "Araumi of the Dead Tide", colors: ['U', 'B'], archetypes: ['Encore', 'Reanimator', 'Value', 'Combo'] },
  { name: "Yennett, Cryptic Sovereign", colors: ['W', 'U', 'B'], archetypes: ['Odd CMC', 'Control', 'Big Spells', 'Topdeck'] },
  { name: "Varina, Lich Queen", colors: ['W', 'U', 'B'], archetypes: ['Zombie Tribal', 'Graveyard', 'Aggro', 'Control'] },
  { name: "Gishath, Suns Avatar", colors: ['R', 'G', 'W'], archetypes: ['Dinosaur Tribal', 'Ramp', 'Aggro', 'Stompy'] },
  { name: "Pantlaza, Sun-Favored", colors: ['R', 'G', 'W'], archetypes: ['Dinosaur Tribal', 'Enrage', 'Discover', 'Value'] },
  { name: "Etali, Primal Conqueror", colors: ['R', 'G'], archetypes: ['Ramp', 'Stompy', 'Value'] },
  { name: "Etali, Primal Storm", colors: ['R'], archetypes: ['Cascade', 'Aggro', 'Combo'] },
  { name: "Zacama, Primal Calamity", colors: ['R', 'G', 'W'], archetypes: ['Ramp', 'Combo', 'Control', 'Big Mana'] },
  
  // Additional Popular Commanders
  { name: "Queen Marchesa", colors: ['W', 'B', 'R'], archetypes: ['Politics', 'Monarch', 'Control', 'Midrange'] },
  { name: "Kynaios and Tiro of Meletis", colors: ['W', 'U', 'R', 'G'], archetypes: ['Group Hug', 'Politics', 'Lands'] },
  { name: "Phelddagrif", colors: ['W', 'U', 'G'], archetypes: ['Group Hug', 'Politics', 'Control'] },
  { name: "Zurgo Helmsmasher", colors: ['W', 'B', 'R'], archetypes: ['Voltron', 'Aggro', 'Stompy'] },
  { name: "Alesha, Who Smiles at Death", colors: ['W', 'B', 'R'], archetypes: ['Reanimator', 'Aggro', 'Warrior Tribal'] },
  { name: "Shu Yun, the Silent Tempest", colors: ['W', 'U', 'R'], archetypes: ['Voltron', 'Spellslinger', 'Aggro'] },
  { name: "Tasigur, the Golden Fang", colors: ['U', 'B', 'G'], archetypes: ['Control', 'Combo', 'Value'] },
  { name: "Derevi, Empyrial Tactician", colors: ['W', 'U', 'G'], archetypes: ['Stax', 'Control', 'Tokens'] },
  { name: "Prossh, Skyraider of Kher", colors: ['B', 'R', 'G'], archetypes: ['Tokens', 'Combo', 'Aristocrats'] },
  { name: "Marath, Will of the Wild", colors: ['R', 'G', 'W'], archetypes: ['Tokens', 'Counters', 'Combo'] },
  { name: "Oloro, Ageless Ascetic", colors: ['W', 'U', 'B'], archetypes: ['Lifegain', 'Control', 'Stax'] },
  { name: "Roon of the Hidden Realm", colors: ['W', 'U', 'G'], archetypes: ['Blink', 'Value', 'Control'] },
  { name: "Sydri, Galvanic Genius", colors: ['W', 'U', 'B'], archetypes: ['Artifacts', 'Combo', 'Control'] },
  { name: "Jeleva, Nephalias Scourge", colors: ['U', 'B', 'R'], archetypes: ['Spellslinger', 'Theft', 'Combo'] },
  { name: "Sharuum the Hegemon", colors: ['W', 'U', 'B'], archetypes: ['Artifacts', 'Combo', 'Control'] },
  { name: "Kaervek the Merciless", colors: ['B', 'R'], archetypes: ['Burn', 'Control', 'Politics'] },
  { name: "The Mimeoplasm", colors: ['U', 'B', 'G'], archetypes: ['Reanimator', 'Graveyard', 'Combo'] },
  { name: "Ghave, Guru of Spores", colors: ['W', 'B', 'G'], archetypes: ['Combo', 'Tokens', 'Counters', 'Value'] },
  { name: "Animar, Soul of Elements", colors: ['U', 'R', 'G'], archetypes: ['Creature Tribal', 'Combo', 'Stompy'] },
  { name: "Zedruu the Greathearted", colors: ['W', 'U', 'R'], archetypes: ['Group Hug', 'Politics', 'Control'] },
  { name: "Karador, Ghost Chieftain", colors: ['W', 'B', 'G'], archetypes: ['Reanimator', 'Graveyard', 'Value'] },
  { name: "Riku of Two Reflections", colors: ['U', 'R', 'G'], archetypes: ['Spellslinger', 'Tokens', 'Value'] },
  { name: "Grimgrin, Corpse-Born", colors: ['U', 'B'], archetypes: ['Zombie Tribal', 'Voltron', 'Combo'] },
  { name: "The Scarab God", colors: ['U', 'B'], archetypes: ['Zombie Tribal', 'Control', 'Value'] },
  { name: "The Locust God", colors: ['U', 'R'], archetypes: ['Tokens', 'Draw', 'Combo'] },
  { name: "The Scorpion God", colors: ['B', 'R'], archetypes: ['Counters', 'Control', 'Value'] },
  { name: "Neheb, the Eternal", colors: ['R'], archetypes: ['Big Mana', 'Burn', 'Combo'] },
  { name: "Neheb, Dreadhorde Champion", colors: ['R'], archetypes: ['Aggro', 'Discard', 'Combo'] },
  { name: "Godo, Bandit Warlord", colors: ['R'], archetypes: ['Equipment', 'Voltron', 'Combo'] },
  { name: "Purphoros, God of the Forge", colors: ['R'], archetypes: ['Tokens', 'Burn', 'Combo'] },
  { name: "Purphoros, Bronze-Blooded", colors: ['R'], archetypes: ['Big Mana', 'Stompy', 'Combo'] },
  { name: "Purphoros, the Indomitable", colors: ['R'], archetypes: ['Voltron', 'Aggro'] },
  { name: "Krenko, Mob Boss", colors: ['R'], archetypes: ['Goblin Tribal', 'Tokens', 'Aggro', 'Combo', 'Storm'] },
  { name: "Krenko, Tin Street Kingpin", colors: ['R'], archetypes: ['Goblin Tribal', 'Aggro', 'Tokens'] },
  { name: "Norin the Wary", colors: ['R'], archetypes: ['Chaos', 'Tokens', 'Value'] },
  { name: "Zada, Hedron Grinder", colors: ['R'], archetypes: ['Spellslinger', 'Tokens', 'Combo'] },
  { name: "Rakdos, Lord of Riots", colors: ['B', 'R'], archetypes: ['Big Mana', 'Stompy', 'Aggro'] },
  { name: "Rakdos, the Showstopper", colors: ['B', 'R'], archetypes: ['Chaos', 'Demons', 'Stompy'] },
  { name: "Rakdos, the Defiler", colors: ['B', 'R'], archetypes: ['Demons', 'Aggro', 'Stompy'] },
  { name: "Rakdos, Patron of Chaos", colors: ['B', 'R'], archetypes: ['Chaos', 'Politics', 'Control'] },
  { name: "Kaalia of the Vast", colors: ['W', 'B', 'R'], archetypes: ['Angels Demons Dragons', 'Aggro', 'Stompy'] },
  { name: "Kaalia, Zenith Seeker", colors: ['W', 'B', 'R'], archetypes: ['Angels Demons Dragons', 'Value', 'Midrange'] },
  { name: "Alesha, Who Smiles at Death", colors: ['W', 'B', 'R'], archetypes: ['Reanimator', 'Aggro', 'Warrior Tribal'] },
  { name: "Mathas, Fiend Seeker", colors: ['W', 'B', 'R'], archetypes: ['Politics', 'Control', 'Value'] },
  { name: "Edgar Markov", colors: ['W', 'B', 'R'], archetypes: ['Vampire Tribal', 'Aggro', 'Tokens', 'Aristocrats', 'Midrange', 'Control'] },
  { name: "Edgar, Charmed Groom", colors: ['W', 'B', 'R'], archetypes: ['Vampire Tribal', 'Tokens', 'Value'] },
  { name: "Olivia, Crimson Bride", colors: ['B', 'R'], archetypes: ['Vampire Tribal', 'Reanimator', 'Aggro'] },
  { name: "Olivia Voldaren", colors: ['B', 'R'], archetypes: ['Vampire Tribal', 'Control', 'Value'] },
  { name: "Strefan, Maurer Progenitor", colors: ['B', 'R'], archetypes: ['Vampire Tribal', 'Tokens', 'Aggro'] },
  { name: "Sorin, Imperious Bloodlord", colors: ['B'], archetypes: ['Vampire Tribal', 'Aggro', 'Midrange'] },
  { name: "Sorin Markov", colors: ['B'], archetypes: ['Control', 'Value', 'Midrange'] },
  { name: "Sorin, Lord of Innistrad", colors: ['W', 'B'], archetypes: ['Tokens', 'Control', 'Value'] },
  { name: "Sorin, Grim Nemesis", colors: ['W', 'B'], archetypes: ['Control', 'Value', 'Midrange'] },
  { name: "Sorin, Vengeful Bloodlord", colors: ['W', 'B'], archetypes: ['Reanimator', 'Value', 'Control'] },
  { name: "Sorin the Mirthless", colors: ['B'], archetypes: ['Control', 'Value', 'Midrange'] },
  { name: "Sorin, Vampire Lord", colors: ['W', 'B'], archetypes: ['Vampire Tribal', 'Control', 'Value'] },
];

// Base staples for all decks
const BASE_STAPLES = ['Sol Ring', 'Arcane Signet', 'Command Tower'];

// Color-specific staples
const COLOR_STAPLES = {
  'U': ['Counterspell', 'Cyclonic Rift', 'Brainstorm', 'Ponder', 'Preordain', 'Mystic Remora', 'Rhystic Study'],
  'B': ['Demonic Tutor', 'Toxic Deluge', 'Fatal Push', 'Thoughtseize', 'Vampiric Tutor', 'Necropotence'],
  'R': ['Chaos Warp', 'Blasphemous Act', 'Lightning Bolt', 'Abrade', 'Wheel of Fortune', 'Dockside Extortionist'],
  'G': ['Cultivate', 'Kodamas Reach', 'Beast Within', 'Nature Claim', 'Eternal Witness', 'Craterhoof Behemoth'],
  'W': ['Swords to Plowshares', 'Path to Exile', 'Wrath of God', 'Teferis Protection', 'Smothering Tithe'],
};

// Generic staples
const GENERIC_STAPLES = [
  'Opt', 'Abrupt Decay', 'Terminate', 'Assassins Trophy',
  'Anguished Unmaking', 'Dismember', 'Heroic Intervention', 'Veil of Summer',
  'Mana Crypt', 'Mana Vault', 'Chrome Mox', 'Mox Opal'
];

// Additional filler cards to reach 100 cards
const FILLER_CARDS = [
  'Lightning Greaves', 'Swiftfoot Boots', 'Reliquary Tower', 'Homeward Path',
  'Bojuka Bog', 'Field of Ruin', 'Ghost Quarter', 'Strip Mine',
  'Exotic Orchard', 'Path of Ancestry', 'Reflecting Pool', 'City of Brass',
  'Mana Confluence', 'Ancient Tomb', 'Blighted Woodland', 'Myriad Landscape',
  'Terramorphic Expanse', 'Evolving Wilds', 'Fabled Passage', 'Prismatic Vista',
  'Ash Barrens', 'Krosan Verge', 'Nykthos, Shrine to Nyx', 'Cabal Coffers',
  'Gaea Cradle', 'Serras Sanctum', 'Tolarian Academy', 'Urborg, Tomb of Yawgmoth',
  'Yavimaya, Cradle of Growth', 'Valakut, the Molten Pinnacle', 'Dark Depths',
  'Thespians Stage', 'Vesuva', 'The Tabernacle at Pendrell Vale', 'Maze of Ith',
  'Karakas', 'Gavony Township', 'Vault of the Archangel', 'Kessig Wolf Run',
  'Inkmoth Nexus', 'Blinkmoth Nexus', 'Mutavault', 'Treetop Village',
  'Faerie Conclave', 'Stalking Stones', 'Ghitu Encampment', 'Spawning Pool',
  'Raging Ravine', 'Lavaclaw Reaches', 'Stirring Wildwood', 'Celestial Colonnade',
  'Creeping Tar Pit', 'Shambling Vent', 'Needle Spires', 'Wandering Fumarole',
  'Hissing Quagmire', 'Lumbering Falls', 'Prairie Stream', 'Sunken Hollow',
  'Smoldering Marsh', 'Cinder Glade', 'Canopy Vista', 'Fortified Village',
  'Port Town', 'Game Trail', 'Inspiring Vantage', 'Spirebluff Canal',
  'Botanical Sanctum', 'Concealed Courtyard', 'Inspiring Vantage', 'Irrigated Farmland',
  'Scattered Groves', 'Sheltered Thicket', 'Fetid Pools', 'Cascading Cataracts',
  'Aether Hub', 'Spire of Industry', 'Unclaimed Territory', 'Secluded Courtyard',
  'Cavern of Souls', 'Glimmervoid', 'Tarnished Citadel', 'Forbidden Orchard',
  'Gemstone Mine', 'Grand Coliseum', 'Tarnished Citadel', 'Undiscovered Paradise',
  'Rupture Spire', 'Transguild Promenade', 'Vivid Meadow', 'Vivid Creek',
  'Vivid Marsh', 'Vivid Grove', 'Vivid Crag', 'Command Beacon',
  'Myriad Landscape', 'Blighted Woodland', 'Blighted Fen', 'Blighted Steppe',
  'Blighted Cataract', 'Blighted Gorge', 'Arch of Orazca', 'Alchemists Refuge',
  'Boseiju, Who Shelters All', 'Cavern of Souls', 'Desolate Lighthouse', 'Geier Reach Sanitarium',
  'Hall of the Bandit Lord', 'Homeward Path', 'Mikokoro, Center of the Sea', 'Minamo, School at Waters Edge',
  'Oboro, Palace in the Clouds', 'Okina, Temple to the Grandfathers', 'Pendelhaven', 'Petrified Field',
  'Phyrexian Tower', 'Riptide Laboratory', 'Shizo, Deaths Storehouse', 'Tolaria West',
  'Academy Ruins', 'Volraths Stronghold', 'Yavimaya Hollow', 'Zoetic Cavern'
];

function generateDeckList(commander, archetype) {
  let deckList = `${commander.name}\n`;
  const cards = new Set(); // Track cards to avoid duplicates
  let cardCount = 0;
  
  // Add base staples
  BASE_STAPLES.forEach(card => {
    if (!cards.has(card)) {
      deckList += `1 ${card}\n`;
      cards.add(card);
      cardCount++;
    }
  });
  
  // Add color-specific staples
  commander.colors.forEach(color => {
    if (COLOR_STAPLES[color]) {
      COLOR_STAPLES[color].forEach(card => {
        if (!cards.has(card) && cardCount < 99) {
          deckList += `1 ${card}\n`;
          cards.add(card);
          cardCount++;
        }
      });
    }
  });
  
  // Add archetype-specific cards
  if (archetype.includes('Tribal') && cardCount < 99) {
    const tribalCards = ['Coat of Arms', 'Door of Destinies', 'Vanquishers Banner', 'Heraldic Banner', 'Icon of Ancestry'];
    tribalCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if (archetype.includes('Tokens') && cardCount < 99) {
    const tokenCards = ['Anointed Procession', 'Parallel Lives', 'Doubling Season', 'Primal Vigor', 'Second Harvest'];
    tokenCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if ((archetype.includes('Landfall') || archetype.includes('Lands')) && cardCount < 99) {
    const landCards = ['Scapeshift', 'Crucible of Worlds', 'Ramunap Excavator', 'Azusa, Lost but Seeking', 'Oracle of Mul Daya'];
    landCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if ((archetype.includes('Reanimator') || archetype.includes('Graveyard')) && cardCount < 99) {
    const gyCards = ['Reanimate', 'Animate Dead', 'Living Death', 'Dance of the Dead', 'Necromancy'];
    gyCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if (archetype.includes('Combo') && cardCount < 99) {
    const comboCards = ['Demonic Consultation', 'Thassa Oracle', 'Laboratory Maniac', 'Jace, Wielder of Mysteries'];
    comboCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if (archetype.includes('Control') && cardCount < 99) {
    const controlCards = ['Force of Will', 'Force of Negation', 'Pact of Negation', 'Fierce Guardianship', 'Deflecting Swat'];
    controlCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  if (archetype.includes('Ramp') && cardCount < 99) {
    const rampCards = ['Mana Vault', 'Mana Crypt', 'Ancient Tomb', 'Grim Monolith', 'Basalt Monolith'];
    rampCards.forEach(card => {
      if (!cards.has(card) && cardCount < 99) {
        deckList += `1 ${card}\n`;
        cards.add(card);
        cardCount++;
      }
    });
  }
  
  // Add generic staples
  GENERIC_STAPLES.forEach(card => {
    if (!cards.has(card) && cardCount < 99) {
      deckList += `1 ${card}\n`;
      cards.add(card);
      cardCount++;
    }
  });
  
  // Calculate how many lands we need (aim for 36-38 lands, rest are spells)
  const targetLands = 36;
  const currentSpells = cardCount;
  const landsNeeded = Math.max(0, targetLands - (99 - currentSpells));
  const spellsNeeded = 99 - currentSpells - landsNeeded;
  
  // Add filler spells to reach target
  let fillerIndex = 0;
  while (cardCount < 99 - landsNeeded && fillerIndex < FILLER_CARDS.length) {
    const card = FILLER_CARDS[fillerIndex];
    if (!cards.has(card) && !card.includes('Plains') && !card.includes('Island') && 
        !card.includes('Swamp') && !card.includes('Mountain') && !card.includes('Forest')) {
      deckList += `1 ${card}\n`;
      cards.add(card);
      cardCount++;
    }
    fillerIndex++;
  }
  
  // Add lands to reach exactly 99 cards total (commander is separate)
  const colorMap = { 'W': 'Plains', 'U': 'Island', 'B': 'Swamp', 'R': 'Mountain', 'G': 'Forest' };
  const landsToAdd = 99 - cardCount;
  
  if (commander.colors.length === 1) {
    // Mono-color: all same basic
    for (let i = 0; i < landsToAdd; i++) {
      deckList += `1 ${colorMap[commander.colors[0]]}\n`;
    }
  } else if (commander.colors.length === 2) {
    // Two-color: split evenly
    const half = Math.floor(landsToAdd / 2);
    for (let i = 0; i < half; i++) {
      deckList += `1 ${colorMap[commander.colors[0]]}\n`;
    }
    for (let i = 0; i < landsToAdd - half; i++) {
      deckList += `1 ${colorMap[commander.colors[1]]}\n`;
    }
  } else {
    // Multi-color: distribute across all colors
    const perColor = Math.floor(landsToAdd / commander.colors.length);
    const remainder = landsToAdd % commander.colors.length;
    commander.colors.forEach((color, idx) => {
      const count = perColor + (idx < remainder ? 1 : 0);
      for (let i = 0; i < count; i++) {
        deckList += `1 ${colorMap[color]}\n`;
      }
    });
  }
  
  return deckList;
}

async function addDecks() {
  const userId = '990d69b2-3500-4833-81df-b05e07f929db'; // Public decks user
  
  let totalDecks = 0;
  
  for (const commander of COMMANDER_VARIANTS) {
    for (const archetype of commander.archetypes) {
      try {
        const deckTitle = `${commander.name} - ${archetype}`;
        const deckText = generateDeckList(commander, archetype);
        const createdAt = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
        
        // Check if deck already exists
        const { data: existing } = await supabase
          .from('decks')
          .select('id')
          .eq('title', deckTitle)
          .eq('user_id', userId)
          .single();
        
        if (existing) {
          console.log(`⊘ Skipped (exists): ${deckTitle}`);
          continue;
        }
        
        // Insert deck
        const { data: deck, error: deckError } = await supabase
          .from('decks')
          .insert({
            user_id: userId,
            title: deckTitle,
            format: 'Commander',
            plan: 'Optimized',
            colors: commander.colors,
            currency: 'USD',
            deck_text: deckText,
            commander: commander.name,
            is_public: true,
            public: true,
            created_at: createdAt.toISOString(),
            updated_at: createdAt.toISOString(),
          })
          .select()
          .single();
        
        if (deckError) {
          console.error(`✗ Error creating deck ${deckTitle}:`, deckError.message);
          continue;
        }
        
        // Parse and insert deck cards
        const lines = deckText.split('\n').filter(line => line.trim());
        let cardCount = 0;
        const insertedCards = new Set();
        
        for (const line of lines) {
          const parts = line.trim().split(' ');
          if (parts.length >= 2) {
            const qty = parseInt(parts[0].replace('x', '')) || 1;
            const cardName = parts.slice(1).join(' ');
            
            // Skip commander (it's added separately)
            if (cardName && cardName !== commander.name && !insertedCards.has(cardName)) {
              await supabase
                .from('deck_cards')
                .insert({
                  deck_id: deck.id,
                  name: cardName,
                  qty: qty,
                })
                .catch(() => {}); // Ignore conflicts
              insertedCards.add(cardName);
              cardCount += qty;
            }
          }
        }
        
        // Insert commander as a card
        await supabase
          .from('deck_cards')
          .insert({
            deck_id: deck.id,
            name: commander.name,
            qty: 1,
          })
          .catch(() => {}); // Ignore conflicts
        
        const totalCards = cardCount + 1; // +1 for commander
        if (totalCards !== 100) {
          console.warn(`⚠ Warning: ${deckTitle} has ${totalCards} cards (expected 100)`);
        }
        
        totalDecks++;
        console.log(`✓ Created (${totalDecks}): ${deckTitle} - ${totalCards} cards`);
      } catch (error) {
        console.error(`✗ Error processing ${commander.name} - ${archetype}:`, error.message);
      }
    }
  }
  
  console.log(`\n✅ Done! Created ${totalDecks} new public decks.`);
}

// Run the script
addDecks().catch(console.error);
