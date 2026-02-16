/**
 * Deterministic synergy packages based on commander tags.
 * No AI, no card names — template-based.
 */

import type { CommanderProfile } from "@/lib/commanders";

const SYNERGY_MAP: Record<string, string[]> = {
  angels: ["Angel token makers + anthem effects", "Lifelink payoffs + recursion", "Ramp into high-CMC angels"],
  vampires: ["Vampire token multipliers + +1/+1 counters", "Lifelink and drain effects", "Haste enablers for aggro"],
  dragons: ["Dragon cost reducers + haste enablers", "Treasure ramp + big threats", "Anthem effects for flying beatdown"],
  goblins: ["Goblin token swarm + damage on ETB", "Haste enablers + sacrifice outlets", "Impact Tremors–style effects"],
  elves: ["Mana dorks + token makers", "Overrun finishers + anthem", "Elf-based card draw"],
  tokens: ["Token doublers + producers", "Anthem effects + sacrifice payoffs", "Go-wide combat finishers"],
  aristocrats: ["Sacrifice outlets + death triggers", "Token makers + drain effects", "Recursion for value loops"],
  proliferate: ["+1/+1 counter engines + proliferate", "Infect or planeswalker payoffs", "Protective spells for key pieces"],
  lifegain: ["Soul sisters–style lifegain + payoffs", "Life drain and life matters", "Stabilization + incremental value"],
  graveyard: ["Discard/mill + reanimation", "Recursive creatures + sacrifice", "Graveyard payoffs"],
  reanimator: ["Discard + reanimation spells", "Big targets + recursion", "Graveyard protection"],
  treasure: ["Treasure creators + payoffs", "Artifact synergies + mana acceleration", "Sacrifice for value"],
  spellslinger: ["Cantrips + rituals", "Token makers from spells", "Storm or burn payoffs"],
  ninjas: ["Evasive one-drops + ninjutsu", "Top-deck manipulation", "Bounce/flicker for triggers"],
  zombies: ["Zombie token makers + lords", "Graveyard recursion", "Sacrifice and amass"],
  dinosaurs: ["Cost reducers + discover", "Blink and enrage synergies", "Ramp into big threats"],
  ramp: ["Land ramp + mana rocks", "Big spell payoffs", "Card draw for gas"],
  combo: ["Tutor pieces + redundancy", "Mana sinks + protection", "Alternative wincons"],
  control: ["Counterspells + removal", "Card advantage engines", "Win condition protection"],
};

export function getSynergyBullets(profile: CommanderProfile): string[] {
  const tags = (profile.tags ?? []).map((t) => t.toLowerCase());
  for (const tag of tags) {
    const bullets = SYNERGY_MAP[tag];
    if (bullets?.length) return bullets.slice(0, 3);
  }
  return [
    "Ramp and card draw form the foundation",
    "Removal and interaction answer threats",
    "Synergy payoffs close games",
  ];
}

type Props = {
  profile: CommanderProfile;
};

export function CommanderSynergyTeaser({ profile }: Props) {
  const bullets = getSynergyBullets(profile);
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">Common synergy packages</h2>
      <ul className="space-y-2 text-neutral-300 text-sm">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-cyan-500 shrink-0">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
