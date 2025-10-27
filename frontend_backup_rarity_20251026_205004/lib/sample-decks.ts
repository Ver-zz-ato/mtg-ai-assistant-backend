// Sample Commander decks for new users
// Popular, budget-friendly archetypes

export interface SampleDeck {
  id: string;
  name: string;
  commander: string;
  description: string;
  colors: string[];
  powerLevel: number; // 1-10
  estimatedPrice: number;
  deckList: string; // Standard MTG decklist format
  archetype: string;
}

export const SAMPLE_DECKS: SampleDeck[] = [
  {
    id: 'ur-dragon-tribal',
    name: 'The Ur-Dragon - Dragon Tribal',
    commander: 'The Ur-Dragon',
    description: 'A powerful five-color dragon tribal deck. Ramp into massive flying threats and dominate the late game.',
    colors: ['W', 'U', 'B', 'R', 'G'],
    powerLevel: 7,
    estimatedPrice: 150,
    archetype: 'Tribal Aggro',
    deckList: `1 The Ur-Dragon

// Ramp (12)
1 Sol Ring
1 Arcane Signet
1 Commander's Sphere
1 Chromatic Lantern
1 Kodama's Reach
1 Cultivate
1 Rampant Growth
1 Nature's Lore
1 Three Visits
1 Farseek
1 Skyshroud Claim
1 Explosive Vegetation

// Dragons (30)
1 Dragonlord Ojutai
1 Dragonlord Silumgar
1 Dragonlord Atarka
1 Dragonlord Dromoka
1 Dragonlord Kolaghan
1 Bladewing the Risen
1 Nicol Bolas
1 Palladia-Mors
1 Vaevictis Asmadi
1 Chromium
1 Arcades Sabboth
1 Steel Hellkite
1 Utvara Hellkite
1 Scourge of Valkas
1 Karrthus, Tyrant of Jund
1 Lathliss, Dragon Queen
1 Scion of the Ur-Dragon
1 Dragonmaster Outcast
1 Thunderbreak Regent
1 Stormbreath Dragon
1 Glorybringer
1 Niv-Mizzet, Parun
1 Niv-Mizzet, Dracogenius
1 Atarka, World Render
1 Dromoka, the Eternal
1 Kolaghan, the Storm's Fury
1 Ojutai, Soul of Winter
1 Silumgar, the Drifting Death
1 Dragon Broodmother
1 Savage Ventmaw

// Support (20)
1 Sarkhan, Fireblood
1 Sarkhan Vol
1 Crucible of Fire
1 Dragon Tempest
1 Rhythm of the Wild
1 Temur Ascendancy
1 Kindred Discovery
1 Descendants' Path
1 Elemental Bond
1 Return of the Wildspeaker
1 Rishkar's Expertise
1 Heroic Intervention
1 Teferi's Protection
1 Cyclonic Rift
1 Beast Within
1 Chaos Warp
1 Dragonlord's Servant
1 Dragonspeaker Shaman
1 Urza's Incubator
1 Herald's Horn

// Lands (37)
1 Command Tower
1 Path of Ancestry
1 Exotic Orchard
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Sandsteppe Citadel
1 Opulent Palace
1 Nomad Outpost
1 Mystic Monastery
1 Frontier Bivouac
1 Savage Lands
1 Crumbling Necropolis
1 Jungle Shrine
1 Arcane Sanctum
1 Seaside Citadel
1 Evolving Wilds
1 Terramorphic Expanse
1 Command Beacon
3 Forest
3 Mountain
2 Plains
2 Island
2 Swamp
1 Rootbound Crag
1 Sunpetal Grove
1 Dragonskull Summit
1 Drowned Catacomb
1 Glacial Fortress
1 Hinterland Harbor
`,
  },
  {
    id: 'atraxa-superfriends',
    name: 'Atraxa, Praetors\' Voice - Superfriends',
    commander: 'Atraxa, Praetors\' Voice',
    description: 'Control the board with powerful planeswalkers. Proliferate your way to ultimate abilities.',
    colors: ['W', 'U', 'B', 'G'],
    powerLevel: 8,
    estimatedPrice: 200,
    archetype: 'Control/Superfriends',
    deckList: `1 Atraxa, Praetors' Voice

// Planeswalkers (20)
1 Jace, the Mind Sculptor
1 Teferi, Hero of Dominaria
1 Liliana Vess
1 Garruk Wildspeaker
1 Elspeth, Sun's Champion
1 Tamiyo, Field Researcher
1 Oko, Thief of Crowns
1 Vraska, Golgari Queen
1 Kiora, Behemoth Beckoner
1 Nissa, Who Shakes the World
1 Ajani, Mentor of Heroes
1 Kaya, Orzhov Usurper
1 Sorin, Grim Nemesis
1 Narset, Parter of Veils
1 Dovin Baan
1 Tezzeret the Seeker
1 Venser, the Sojourner
1 Karn Liberated
1 Ugin, the Spirit Dragon
1 Nicol Bolas, Dragon-God

// Ramp (10)
1 Sol Ring
1 Arcane Signet
1 Commander's Sphere
1 Chromatic Lantern
1 Kodama's Reach
1 Cultivate
1 Farseek
1 Nature's Lore
1 Three Visits
1 Birds of Paradise

// Proliferate & Support (20)
1 Deepglow Skate
1 Inexorable Tide
1 Contagion Engine
1 Viral Drake
1 Thrummingbird
1 Karn's Bastion
1 Evolution Sage
1 Flux Channeler
1 Grateful Apparition
1 Winding Constrictor
1 Doubling Season
1 Oath of Teferi
1 The Chain Veil
1 Cyclonic Rift
1 Counterspell
1 Swords to Plowshares
1 Path to Exile
1 Anguished Unmaking
1 Toxic Deluge
1 Supreme Verdict

// Card Draw (12)
1 Rhystic Study
1 Mystic Remora
1 Sylvan Library
1 Phyrexian Arena
1 Consecrated Sphinx
1 Blue Sun's Zenith
1 Pull from Tomorrow
1 Stroke of Genius
1 Fact or Fiction
1 Brainstorm
1 Ponder
1 Preordain

// Lands (37)
1 Command Tower
1 Breeding Pool
1 Overgrown Tomb
1 Temple Garden
1 Hallowed Fountain
1 Godless Shrine
1 Watery Grave
1 Sunpetal Grove
1 Hinterland Harbor
1 Woodland Cemetery
1 Glacial Fortress
1 Drowned Catacomb
1 Isolated Chapel
1 Evolving Wilds
1 Terramorphic Expanse
1 Exotic Orchard
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Opal Palace
1 Rogue's Passage
4 Forest
4 Island
3 Plains
3 Swamp
1 Reliquary Tower
1 Alchemist's Refuge
1 Gavony Township
`,
  },
  {
    id: 'edgar-markov-vampires',
    name: 'Edgar Markov - Vampire Tribal',
    commander: 'Edgar Markov',
    description: 'Aggressive vampire tribal with token generation. Swarm the board and drain life from opponents.',
    colors: ['W', 'B', 'R'],
    powerLevel: 7,
    estimatedPrice: 120,
    archetype: 'Tribal Aggro',
    deckList: `1 Edgar Markov

// Vampires (35)
1 Bloodline Keeper
1 Captivating Vampire
1 Vampire Nocturnus
1 Stromkirk Captain
1 Dusk Legion Zealot
1 Legion Lieutenant
1 Champion of Dusk
1 Forerunner of the Legion
1 Mavren Fein, Dusk Apostle
1 Sanctum Seeker
1 Vito, Thorn of the Dusk Rose
1 Elenda, the Dusk Rose
1 Malakir Bloodwitch
1 Kalitas, Bloodchief of Ghet
1 Anowon, the Ruin Sage
1 Bloodghast
1 Vampire Nighthawk
1 Kalastria Highborn
1 Falkenrath Aristocrat
1 Olivia Voldaren
1 Olivia, Mobilized for War
1 Necropolis Regent
1 Drana, Liberator of Malakir
1 Bloodlord of Vaasgoth
1 Viscera Seer
1 Blood Artist
1 Zulaport Cutthroat
1 Butcher of Malakir
1 Cordial Vampire
1 Stromkirk Condemned
1 Vampire Cutthroat
1 Indulgent Aristocrat
1 Legion's Landing
1 Sorin, Imperious Bloodlord
1 Sorin, Lord of Innistrad

// Tribal Support (10)
1 Shared Animosity
1 Door of Destinies
1 Herald's Horn
1 Vanquisher's Banner
1 Urza's Incubator
1 Coat of Arms
1 Blade of the Bloodchief
1 Cover of Darkness
1 Stensia Masquerade
1 Phyrexian Arena

// Removal & Interaction (10)
1 Path to Exile
1 Swords to Plowshares
1 Anguished Unmaking
1 Utter End
1 Chaos Warp
1 Dreadbore
1 Terminate
1 Crackling Doom
1 Merciless Eviction
1 Wrath of God

// Ramp & Rocks (7)
1 Sol Ring
1 Arcane Signet
1 Commander's Sphere
1 Talisman of Indulgence
1 Talisman of Conviction
1 Talisman of Hierarchy
1 Boros Signet

// Lands (37)
1 Command Tower
1 Blood Crypt
1 Sacred Foundry
1 Godless Shrine
1 Dragonskull Summit
1 Clifftop Retreat
1 Isolated Chapel
1 Nomad Outpost
1 Savai Triome
1 Luxury Suite
1 Vault of Champions
1 Spectator Seating
1 Battlefield Forge
1 Caves of Koilos
1 Sulfurous Springs
1 Temple of Triumph
1 Temple of Silence
1 Temple of Malice
1 Evolving Wilds
1 Terramorphic Expanse
1 Path of Ancestry
1 Unclaimed Territory
1 Cavern of Souls
4 Swamp
4 Plains
3 Mountain
1 Rogue's Passage
1 Castle Locthwain
`,
  },
  {
    id: 'ghired-tokens',
    name: 'Ghired, Conclave Exile - Token Army',
    commander: 'Ghired, Conclave Exile',
    description: 'Create and populate massive token armies. Overwhelm opponents with sheer numbers.',
    colors: ['R', 'G', 'W'],
    powerLevel: 6,
    estimatedPrice: 80,
    archetype: 'Token Swarm',
    deckList: `1 Ghired, Conclave Exile

// Token Creators (25)
1 Trostani, Selesnya's Voice
1 Rhys the Redeemed
1 Rith, the Awakener
1 Hornet Queen
1 Avenger of Zendikar
1 Armada Wurm
1 Giant Adephage
1 Worldspine Wurm
1 Tendershoot Dryad
1 Deep Forest Hermit
1 Deranged Hermit
1 Blade Splicer
1 Godsire
1 Dragonlair Spider
1 Utvara Hellkite
1 Warstorm Surge
1 Parallel Lives
1 Anointed Procession
1 Doubling Season
1 Primal Vigor
1 Second Harvest
1 March of the Multitudes
1 Beast Within
1 Generous Gift
1 White Sun's Zenith

// Populate & Support (15)
1 Growing Ranks
1 Rootborn Defenses
1 Trostani's Summoner
1 Vitu-Ghazi Guildmage
1 Sundering Growth
1 Eyes in the Skies
1 Grove of the Guardian
1 Selesnya Guildmage
1 Phyrexian Rebirth
1 Rampaging Baloths
1 Scute Swarm
1 Awakening Zone
1 From Beyond
1 Cathars' Crusade
1 Impact Tremors

// Ramp (12)
1 Sol Ring
1 Arcane Signet
1 Kodama's Reach
1 Cultivate
1 Rampant Growth
1 Nature's Lore
1 Three Visits
1 Farseek
1 Skyshroud Claim
1 Explosive Vegetation
1 Selesnya Signet
1 Gruul Signet

// Removal & Protection (10)
1 Heroic Intervention
1 Eerie Interlude
1 Teferi's Protection
1 Swords to Plowshares
1 Path to Exile
1 Return of the Wildspeaker
1 Shamanic Revelation
1 Decree of Justice
1 Martial Coup
1 Hour of Reckoning

// Lands (37)
1 Command Tower
1 Temple Garden
1 Stomping Ground
1 Sacred Foundry
1 Sunpetal Grove
1 Rootbound Crag
1 Clifftop Retreat
1 Canopy Vista
1 Cinder Glade
1 Jetmir's Garden
1 Jungle Shrine
1 Bountiful Promenade
1 Spire Garden
1 Spectator Seating
1 Exotic Orchard
1 Reflecting Pool
1 Path of Ancestry
1 Mosswort Bridge
1 Windbrisk Heights
1 Kessig Wolf Run
1 Skarrg, the Rage Pits
1 Gavony Township
1 Evolving Wilds
1 Terramorphic Expanse
1 Myriad Landscape
4 Forest
4 Plains
2 Mountain
1 Rogue's Passage
`,
  },
  {
    id: 'yuriko-ninjas',
    name: 'Yuriko, the Tiger\'s Shadow - Ninja Tribal',
    commander: 'Yuriko, the Tiger\'s Shadow',
    description: 'Slip in with evasive creatures, reveal high CMC spells, and drain the table. Budget-friendly and powerful.',
    colors: ['U', 'B'],
    powerLevel: 8,
    estimatedPrice: 100,
    archetype: 'Aggro/Combo',
    deckList: `1 Yuriko, the Tiger's Shadow

// Ninjas (20)
1 Ninja of the Deep Hours
1 Sakashima's Student
1 Walker of Secret Ways
1 Throat Slitter
1 Ink-Eyes, Servant of Oni
1 Silent-Blade Oni
1 Mistblade Shinobi
1 Ninja of the New Moon
1 Mist-Syndicate Naga
1 Changeling Outcast
1 Ingenious Infiltrator
1 Higure, the Still Wind
1 Fallen Shinobi
1 Moonblade Shinobi
1 Moonsnare Specialist
1 Dokuchi Silencer
1 Nashi, Moon Sage's Scion
1 Silver-Fur Master
1 Satoru Umezawa
1 Kaito Shizuki

// Evasive Creatures (12)
1 Ornithopter
1 Tormented Soul
1 Faerie Seer
1 Mausoleum Wanderer
1 Spectral Sailor
1 Slither Blade
1 Gudul Lurker
1 Tetsuko Umezawa, Fugitive
1 Hope of Ghirapur
1 Signal Pest
1 Baleful Strix
1 Cloud of Faeries

// High CMC Spells (10)
1 Draco
1 Temporal Trespass
1 Temporal Mastery
1 Enter the Infinite
1 Aminatou's Augury
1 Dig Through Time
1 Treasure Cruise
1 Consign // Oblivion
1 Commit // Memory
1 Blinkmoth Infusion

// Card Draw & Tutor (10)
1 Rhystic Study
1 Mystic Remora
1 Brainstorm
1 Ponder
1 Preordain
1 Scroll Rack
1 Sensei's Divining Top
1 Vampiric Tutor
1 Mystical Tutor
1 Fabricate

// Interaction (10)
1 Counterspell
1 Swan Song
1 Arcane Denial
1 Negate
1 Force of Will
1 Cyclonic Rift
1 Consult the Necrosages
1 Dismember
1 Snuff Out
1 Murderous Cut

// Ramp & Rocks (7)
1 Sol Ring
1 Arcane Signet
1 Dimir Signet
1 Talisman of Dominance
1 Fellwar Stone
1 Mind Stone
1 Thought Vessel

// Lands (30)
1 Command Tower
1 Sunken Hollow
1 Choked Estuary
1 Temple of Deceit
1 Dimir Aqueduct
1 Underground River
1 Darkwater Catacombs
1 Tainted Isle
1 Jwar Isle Refuge
1 Dismal Backwater
1 Evolving Wilds
1 Terramorphic Expanse
1 Exotic Orchard
1 Reflecting Pool
1 Myriad Landscape
1 Opal Palace
7 Island
6 Swamp
1 Reliquary Tower
1 Rogue's Passage
`,
  },
];

// Helper to get a random sample deck
export function getRandomSampleDeck(): SampleDeck {
  const randomIndex = Math.floor(Math.random() * SAMPLE_DECKS.length);
  return SAMPLE_DECKS[randomIndex];
}

// Helper to get deck by ID
export function getSampleDeckById(id: string): SampleDeck | undefined {
  return SAMPLE_DECKS.find(deck => deck.id === id);
}

