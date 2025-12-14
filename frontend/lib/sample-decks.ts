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
  {
    id: 'kess-spellslinger',
    name: 'Kess, Dissident Mage - Spellslinger Combo',
    commander: 'Kess, Dissident Mage',
    description: 'Cast spells from your graveyard and chain together powerful instants and sorceries for explosive combo turns.',
    colors: ['U', 'B', 'R'],
    powerLevel: 8,
    estimatedPrice: 130,
    archetype: 'Combo',
    deckList: `1 Kess, Dissident Mage

// Combo Pieces (15)
1 Demonic Consultation
1 Thassa's Oracle
1 Laboratory Maniac
1 Jace, Wielder of Mysteries
1 Doomsday
1 Ad Nauseam
1 Tendrils of Agony
1 Brain Freeze
1 Underworld Breach
1 Lion's Eye Diamond
1 Aetherflux Reservoir
1 Dramatic Reversal
1 Isochron Scepter
1 Sensei's Divining Top
1 Bolas's Citadel

// Card Draw & Selection (15)
1 Brainstorm
1 Ponder
1 Preordain
1 Serum Visions
1 Opt
1 Gitaxian Probe
1 Mystic Remora
1 Rhystic Study
1 Phyrexian Arena
1 Dark Confidant
1 Necropotence
1 Yawgmoth's Will
1 Wheel of Fortune
1 Windfall
1 Timetwister

// Tutors (10)
1 Demonic Tutor
1 Vampiric Tutor
1 Mystical Tutor
1 Gamble
1 Imperial Seal
1 Diabolic Intent
1 Wishclaw Talisman
1 Solve the Equation
1 Muddle the Mixture
1 Merchant Scroll

// Interaction (12)
1 Counterspell
1 Force of Will
1 Force of Negation
1 Swan Song
1 Flusterstorm
1 Pyroblast
1 Red Elemental Blast
1 Abrade
1 Lightning Bolt
1 Fatal Push
1 Dismember
1 Cyclonic Rift

// Ramp (7)
1 Sol Ring
1 Arcane Signet
1 Izzet Signet
1 Rakdos Signet
1 Dimir Signet
1 Mana Crypt
1 Mana Vault

// Lands (30)
1 Command Tower
1 Steam Vents
1 Blood Crypt
1 Watery Grave
1 Volcanic Island
1 Badlands
1 Underground Sea
1 Scalding Tarn
1 Polluted Delta
1 Bloodstained Mire
1 Flooded Strand
1 Wooded Foothills
1 Misty Rainforest
1 Blood Moon
1 City of Brass
1 Mana Confluence
1 Exotic Orchard
1 Reflecting Pool
1 Ancient Tomb
1 Reliquary Tower
1 Mystic Sanctuary
1 Sunken Ruins
1 Shivan Reef
1 Sulfurous Springs
1 Underground River
4 Island
2 Swamp
2 Mountain
`,
  },
  {
    id: 'teysa-aristocrats',
    name: 'Teysa Karlov - Aristocrats',
    commander: 'Teysa Karlov',
    description: 'Sacrifice creatures for value. Double your death triggers and drain opponents while building an engine.',
    colors: ['W', 'B'],
    powerLevel: 7,
    estimatedPrice: 90,
    archetype: 'Combo',
    deckList: `1 Teysa Karlov

// Sacrifice Outlets (10)
1 Viscera Seer
1 Carrion Feeder
1 Yahenni, Undying Partisan
1 Altar of Dementia
1 Ashnod's Altar
1 Phyrexian Altar
1 Blasting Station
1 High Market
1 Phyrexian Tower
1 Spawning Pit

// Death Triggers (20)
1 Blood Artist
1 Zulaport Cutthroat
1 Cruel Celebrant
1 Bastion of Remembrance
1 Corpse Knight
1 Syr Konrad, the Grim
1 Elenda, the Dusk Rose
1 Dictate of Erebos
1 Grave Pact
1 Butcher of Malakir
1 Requiem Angel
1 Ogre Slumlord
1 Pawn of Ulamog
1 Sifter of Skulls
1 Pitiless Plunderer
1 Reassembling Skeleton
1 Nether Traitor
1 Bloodsoaked Champion
1 Gravecrawler
1 Doomed Traveler

// Token Generators (15)
1 Bitterblossom
1 Ophiomancer
1 Sram's Expertise
1 Secure the Wastes
1 Lingering Souls
1 Spectral Procession
1 Finale of Glory
1 Divine Visitation
1 Anointed Procession
1 Kaya's Ghostform
1 Karmic Guide
1 Reveillark
1 Sun Titan
1 Emeria Shepherd
1 Adeline, Resplendent Cathar

// Removal & Interaction (10)
1 Swords to Plowshares
1 Path to Exile
1 Anguished Unmaking
1 Vindicate
1 Utter End
1 Toxic Deluge
1 Damnation
1 Wrath of God
1 Merciless Eviction
1 Farewell

// Card Draw (8)
1 Phyrexian Arena
1 Dark Confidant
1 Skullclamp
1 Night's Whisper
1 Sign in Blood
1 Read the Bones
1 Painful Truths
1 Necropotence

// Ramp (6)
1 Sol Ring
1 Arcane Signet
1 Orzhov Signet
1 Talisman of Hierarchy
1 Mind Stone
1 Wayfarer's Bauble

// Lands (35)
1 Command Tower
1 Godless Shrine
1 Isolated Chapel
1 Concealed Courtyard
1 Caves of Koilos
1 Scoured Barrens
1 Orzhov Basilica
1 Temple of Silence
1 Fetid Heath
1 Shineshadow Snarl
1 Brightclimb Pathway
1 Shattered Sanctum
1 Vault of Champions
1 Spectator Seating
1 Path of Ancestry
1 Evolving Wilds
1 Terramorphic Expanse
1 Fabled Passage
1 Phyrexian Tower
1 High Market
1 Bojuka Bog
1 Scavenger Grounds
1 Emeria, the Sky Ruin
1 Cabal Coffers
1 Urborg, Tomb of Yawgmoth
8 Plains
8 Swamp
1 Castle Locthwain
1 Castle Ardenvale
`,
  },
  {
    id: 'chulane-value',
    name: 'Chulane, Teller of Tales - Value Engine',
    commander: 'Chulane, Teller of Tales',
    description: 'Draw cards and ramp with every creature you cast. Build an unstoppable value engine that outpaces opponents.',
    colors: ['W', 'U', 'G'],
    powerLevel: 7,
    estimatedPrice: 110,
    archetype: 'Midrange',
    deckList: `1 Chulane, Teller of Tales

// Value Creatures (25)
1 Coiling Oracle
1 Elvish Visionary
1 Wall of Blossoms
1 Wall of Omens
1 Llanowar Visionary
1 Mulldrifter
1 Cloud of Faeries
1 Peregrine Drake
1 Palinchron
1 Great Whale
1 Deadeye Navigator
1 Eternal Witness
1 Reclamation Sage
1 Acidic Slime
1 Kogla, the Titan Ape
1 Thragtusk
1 Consecrated Sphinx
1 Tatyova, Benthic Druid
1 Aesi, Tyrant of Gyre Strait
1 Tishana, Voice of Thunder
1 Craterhoof Behemoth
1 Avenger of Zendikar
1 Regal Force
1 Prime Speaker Zegana
1 Biovisionary

// Bounce & Replay (8)
1 Cloudstone Curio
1 Temur Sabertooth
1 Erratic Portal
1 Crystal Shard
1 Equilibrium
1 Man-o'-War
1 Venser, Shaper Savant
1 Reflector Mage

// Protection & Interaction (12)
1 Counterspell
1 Swan Song
1 Negate
1 Cyclonic Rift
1 Swords to Plowshares
1 Path to Exile
1 Beast Within
1 Generous Gift
1 Heroic Intervention
1 Teferi's Protection
1 Veil of Summer
1 Autumn's Veil

// Card Draw (8)
1 Rhystic Study
1 Mystic Remora
1 Sylvan Library
1 Brainstorm
1 Ponder
1 Preordain
1 Fact or Fiction
1 Dig Through Time

// Ramp (10)
1 Sol Ring
1 Arcane Signet
1 Simic Signet
1 Selesnya Signet
1 Azorius Signet
1 Kodama's Reach
1 Cultivate
1 Farseek
1 Nature's Lore
1 Three Visits

// Lands (36)
1 Command Tower
1 Breeding Pool
1 Hallowed Fountain
1 Temple Garden
1 Sunpetal Grove
1 Hinterland Harbor
1 Glacial Fortress
1 Flooded Grove
1 Mystic Gate
1 Seaside Citadel
1 Bountiful Promenade
1 Spire Garden
1 Exotic Orchard
1 Reflecting Pool
1 Path of Ancestry
1 Evolving Wilds
1 Terramorphic Expanse
1 Fabled Passage
1 Alchemist's Refuge
1 Mystic Sanctuary
1 Reliquary Tower
1 Gaea's Cradle
1 Nykthos, Shrine to Nyx
5 Forest
4 Island
3 Plains
1 Rogue's Passage
`,
  },
  {
    id: 'grand-arbiter-stax',
    name: 'Grand Arbiter Augustin IV - Stax Control',
    commander: 'Grand Arbiter Augustin IV',
    description: 'Slow opponents down with tax effects and lock pieces. Control the game while you build your win condition.',
    colors: ['W', 'U'],
    powerLevel: 8,
    estimatedPrice: 180,
    archetype: 'Control',
    deckList: `1 Grand Arbiter Augustin IV

// Stax Pieces (20)
1 Thalia, Guardian of Thraben
1 Thalia, Heretic Cathar
1 Vryn Wingmare
1 Glowrider
1 Ethersworn Canonist
1 Rule of Law
1 Arcane Laboratory
1 Eidolon of Rhetoric
1 Drannith Magistrate
1 Lavinia, Azorius Renegade
1 Aven Mindcensor
1 Leonin Arbiter
1 Hushbringer
1 Hushwing Gryff
1 Torpor Orb
1 Winter Orb
1 Static Orb
1 Tangle Wire
1 Trinisphere
1 Sphere of Resistance

// Control & Interaction (15)
1 Counterspell
1 Force of Will
1 Mana Drain
1 Swan Song
1 Flusterstorm
1 Dispel
1 Negate
1 Cyclonic Rift
1 Swords to Plowshares
1 Path to Exile
1 Wrath of God
1 Terminus
1 Supreme Verdict
1 Fumigate
1 Farewell

// Card Draw (10)
1 Rhystic Study
1 Mystic Remora
1 Mystic Confluence
1 Fact or Fiction
1 Brainstorm
1 Ponder
1 Preordain
1 Dig Through Time
1 Treasure Cruise
1 Consecrated Sphinx

// Win Conditions (5)
1 Approach of the Second Sun
1 Laboratory Maniac
1 Jace, Wielder of Mysteries
1 Teferi, Hero of Dominaria
1 Elspeth, Sun's Champion

// Ramp (8)
1 Sol Ring
1 Arcane Signet
1 Azorius Signet
1 Talisman of Progress
1 Fellwar Stone
1 Mind Stone
1 Thought Vessel
1 Wayfarer's Bauble

// Lands (35)
1 Command Tower
1 Hallowed Fountain
1 Glacial Fortress
1 Seachrome Coast
1 Flooded Strand
1 Polluted Delta
1 Marsh Flats
1 Arid Mesa
1 Misty Rainforest
1 Scalding Tarn
1 Tundra
1 Celestial Colonnade
1 Mystic Gate
1 Flooded Grove
1 Prairie Stream
1 Port Town
1 Nimbus Maze
1 Reflecting Pool
1 Exotic Orchard
1 Path of Ancestry
1 Evolving Wilds
1 Terramorphic Expanse
1 Fabled Passage
1 Mystic Sanctuary
1 Reliquary Tower
1 Academy Ruins
1 Inventors' Fair
8 Island
5 Plains
1 Rogue's Passage
`,
  },
  {
    id: 'lathril-elves',
    name: 'Lathril, Blade of the Elves - Elf Tribal',
    commander: 'Lathril, Blade of the Elves',
    description: 'Overwhelm with elf tokens and mana dorks. Generate massive amounts of mana and finish with a big alpha strike.',
    colors: ['B', 'G'],
    powerLevel: 7,
    estimatedPrice: 95,
    archetype: 'Tribal Aggro',
    deckList: `1 Lathril, Blade of the Elves

// Elves (30)
1 Elvish Mystic
1 Llanowar Elves
1 Fyndhorn Elves
1 Heritage Druid
1 Quirion Ranger
1 Wirewood Symbiote
1 Wirewood Channeler
1 Priest of Titania
1 Elvish Archdruid
1 Marwyn, the Nurturer
1 Circle of Dreams Druid
1 Selvala, Heart of the Wilds
1 Ezuri, Renegade Leader
1 Ezuri, Claw of Progress
1 Rhys the Exiled
1 Nath of the Gilt-Leaf
1 Abomination of Llanowar
1 Imperious Perfect
1 Elvish Champion
1 Timberwatch Elf
1 Lys Alana Huntmaster
1 Immaculate Magistrate
1 Joraga Warcaller
1 Craterhoof Behemoth
1 End-Raze Forerunners
1 Allosaurus Shepherd
1 Reclamation Sage
1 Shaman of the Pack
1 Elvish Visionary
1 Beast Whisperer

// Tribal Support (10)
1 Coat of Arms
1 Door of Destinies
1 Vanquisher's Banner
1 Herald's Horn
1 Urza's Incubator
1 Shared Animosity
1 Beastmaster Ascension
1 Overwhelming Stampede
1 Triumph of the Hordes
1 Finale of Devastation

// Removal & Interaction (8)
1 Beast Within
1 Assassin's Trophy
1 Abrupt Decay
1 Putrefy
1 Golgari Charm
1 Toxic Deluge
1 Damnation
1 Deadly Rollick

// Card Draw (6)
1 Sylvan Library
1 Guardian Project
1 Beast Whisperer
1 Shamanic Revelation
1 Return of the Wildspeaker
1 Harmonize

// Ramp (5)
1 Sol Ring
1 Arcane Signet
1 Golgari Signet
1 Talisman of Resilience
1 Wayfarer's Bauble

// Lands (40)
1 Command Tower
1 Overgrown Tomb
1 Woodland Cemetery
1 Llanowar Wastes
1 Deathrite Shaman
1 Blooming Marsh
1 Darkbore Pathway
1 Deathcap Glade
1 Gilt-Leaf Palace
1 Llanowar Reborn
1 Pendelhaven
1 Wirewood Lodge
1 Nykthos, Shrine to Nyx
1 Gaea's Cradle
1 Cavern of Souls
1 Unclaimed Territory
1 Path of Ancestry
1 Evolving Wilds
1 Terramorphic Expanse
1 Fabled Passage
1 Bojuka Bog
1 Reliquary Tower
1 Yavimaya, Cradle of Growth
1 Urborg, Tomb of Yawgmoth
15 Forest
5 Swamp
1 Castle Garenbrig
1 Castle Locthwain
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

