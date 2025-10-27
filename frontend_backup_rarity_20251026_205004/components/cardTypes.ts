export type ProfileCardValue = {
  nameParts: [string, string, string];
  typeLine: string;               // e.g., "Enchantment — Vampire"
  subtext: string;                // flavor/subtext
  pt: { p: number; t: number };   // single P/T box
  cost?: number;                  // small orb number (legacy support)
  manaCost?: string[];           // array of mana symbols like ['2', 'U', 'U', 'R']
  colorHint?: 'W'|'U'|'B'|'R'|'G'|'C'|'M'|'L'|''; // editor hint + art filter
  art: { url: string; artist: string; id?: string };
  rarity?: 'common'|'uncommon'|'rare'|'mythic';     // card rarity
  setSymbol?: string;            // set symbol identifier
};

export type ArtOption = {
  url: string;
  artist: string;
  id: string;
  color?: string;
  name?: string;
};

export type CardFrameProps = {
  value: ProfileCardValue;
  mode?: 'edit' | 'view';
  onChange?: (next: Partial<ProfileCardValue>) => void;
  artOptions?: ArtOption[];
  matte?: { primary?: string; secondary?: string };
  width?: string; // optional external width clamp for shell
};
