export const GENERAL_COMMANDER_FORMAT_INSTRUCTION =
  "Commander/EDH means default multiplayer Commander, not Duel Commander: 100 cards including commander, singleton except basics, commander color identity, command zone and commander tax, and 40 starting life. Use Duel Commander rules, including 20 starting life, only if the user explicitly says Duel Commander.";

export function appendCommanderFormatInstruction(prompt: string, formatKey?: string): string {
  const f = String(formatKey || "").toLowerCase();
  if (f !== "commander" && f !== "edh" && !f.includes("commander")) return prompt;
  if (prompt.includes("default multiplayer Commander, not Duel Commander")) return prompt;
  return `${prompt}\n\n${GENERAL_COMMANDER_FORMAT_INSTRUCTION}`;
}
