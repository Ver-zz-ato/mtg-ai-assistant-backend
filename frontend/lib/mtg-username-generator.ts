/**
 * Generate random MTG-themed usernames for new signups
 * Format: [MTG Term] + [Number/Descriptor]
 */

const MTG_TERMS = [
  // Planeswalkers
  'Jace', 'Liliana', 'Chandra', 'Gideon', 'Nissa', 'Ajani', 'Sorin', 'Karn', 'Teferi', 'Vraska',
  'Elspeth', 'Garruk', 'Kaya', 'Vivien', 'Ral', 'Dovin', 'Domri', 'Sarkhan', 'Tibalt', 'Kiora',
  'Nahiri', 'Ob', 'Tamiyo', 'Ugin', 'Xenagos', 'Ashiok', 'Dack', 'Daretti', 'Freyalise', 'Koth',
  
  // Creatures & Characters
  'Bolas', 'Atraxa', 'Urza', 'Yawgmoth', 'Emrakul', 'Kozilek', 'Ulamog', 'Griselbrand', 'Avacyn',
  'Elesh', 'Vorinclex', 'Jin', 'Sheoldred', 'Urabrask', 'Karn', 'Teferi', 'Nicol', 'Yawg', 'Mishra',
  
  // Magic Terms
  'Mana', 'Spell', 'Enchant', 'Summon', 'Planeswalk', 'Duel', 'Brew', 'Deck', 'Library', 'Graveyard',
  'Hand', 'Battlefield', 'Exile', 'Command', 'Commander', 'Format', 'Meta', 'Draft', 'Sealed',
  'Constructed', 'Limited', 'Standard', 'Modern', 'Legacy', 'Vintage', 'Pioneer', 'Explorer',
  
  // Colors & Mana
  'White', 'Blue', 'Black', 'Red', 'Green', 'Azorius', 'Dimir', 'Rakdos', 'Gruul', 'Selesnya',
  'Orzhov', 'Izzet', 'Golgari', 'Boros', 'Simic', 'Esper', 'Grixis', 'Jund', 'Naya', 'Bant',
  'Abzan', 'Jeskai', 'Sultai', 'Mardu', 'Temur', 'WUBRG', 'Mono', 'Dual', 'Tri', 'Five',
  
  // Game Terms
  'Mulligan', 'Topdeck', 'Cascade', 'Storm', 'Dredge', 'Flashback', 'Suspend', 'Morph', 'Manifest',
  'Transform', 'Fuse', 'Split', 'Aftermath', 'Adventure', 'Mutate', 'Companion', 'Partner',
  
  // Card Types
  'Artifact', 'Creature', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Land', 'Tribal',
  
  // Power Terms
  'Tutor', 'Ramp', 'Draw', 'Removal', 'Counter', 'Burn', 'Mill', 'Reanimate', 'Combo', 'Control',
  'Aggro', 'Midrange', 'Tempo', 'Stax', 'Prison', 'Lock', 'Wincon', 'Threat', 'Answer',
];

const DESCRIPTORS = [
  'Master', 'Adept', 'Mage', 'Wizard', 'Sorcerer', 'Shaman', 'Druid', 'Warrior', 'Knight', 'Paladin',
  'Rogue', 'Assassin', 'Necromancer', 'Artificer', 'Scholar', 'Sage', 'Oracle', 'Prophet', 'Seer',
  'Brewer', 'Builder', 'Crafter', 'Designer', 'Architect', 'Engineer', 'Inventor', 'Tinkerer',
  'Champion', 'Hero', 'Legend', 'Veteran', 'Elite', 'Expert', 'Pro', 'Ace', 'Star', 'Icon',
  'Novice', 'Apprentice', 'Student', 'Learner', 'Beginner', 'Rookie', 'Newcomer',
];

const NUMBERS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Prime', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'First', 'Second', 'Third',
];

/**
 * Generate a random MTG-themed username
 * Format: [MTG Term][Number/Descriptor] or [MTG Term][MTG Term]
 */
export function generateMTGUsername(): string {
  const term1 = MTG_TERMS[Math.floor(Math.random() * MTG_TERMS.length)];
  
  // 70% chance: Term + Number/Descriptor
  // 30% chance: Term + Term (e.g., "JaceMage", "ManaBrewer")
  if (Math.random() < 0.7) {
    const descriptor = Math.random() < 0.5 
      ? DESCRIPTORS[Math.floor(Math.random() * DESCRIPTORS.length)]
      : NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
    return `${term1}${descriptor}${Math.floor(Math.random() * 999) + 1}`;
  } else {
    const term2 = MTG_TERMS[Math.floor(Math.random() * MTG_TERMS.length)];
    return `${term1}${term2}${Math.floor(Math.random() * 999) + 1}`;
  }
}

/**
 * Generate a username and ensure it's unique (check against existing usernames)
 * This would need to be called server-side to check the database
 */
export async function generateUniqueMTGUsername(
  checkUnique: (username: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const username = generateMTGUsername();
    const isUnique = await checkUnique(username);
    if (isUnique) {
      return username;
    }
  }
  // Fallback: add timestamp if all attempts failed
  return `${generateMTGUsername()}${Date.now().toString().slice(-4)}`;
}
