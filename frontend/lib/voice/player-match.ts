/**
 * Shared player-name / alias matching for voice game commands.
 * Keeps backend target resolution grounded to the live table roster.
 */

export type VoicePlayerRef = {
  id: string;
  name: string;
  aliases?: string[];
};

const MIN_SCORE = 0.58;
const MIN_GAP = 0.1;

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d+)/g, " $1 ")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeVoiceName(value: string): string {
  return splitWords(value)
    .join(" ")
    .toLowerCase()
    .trim();
}

function normalizeCompact(value: string): string {
  return normalizeVoiceName(value).replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = row[j];
      row[j] = next;
    }
  }
  return row[b.length] ?? 0;
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function tokenSimilarity(spoken: string, candidate: string): number {
  const spokenTokens = spoken.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (!spokenTokens.length || !candidateTokens.length) return 0;

  let matched = 0;
  for (const spokenToken of spokenTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      if (spokenToken === candidateToken) {
        best = 1;
        break;
      }
      const similarity = stringSimilarity(spokenToken, candidateToken);
      if (similarity >= 0.8) best = Math.max(best, similarity);
    }
    matched += best;
  }

  const recall = matched / spokenTokens.length;
  const precision = matched / candidateTokens.length;
  return recall * 0.72 + precision * 0.28;
}

export function buildPlayerAliases(player: VoicePlayerRef): string[] {
  const out = new Set<string>();
  const push = (value?: string | null) => {
    const normalized = value ? normalizeVoiceName(value) : "";
    if (!normalized) return;
    out.add(normalized);
  };

  push(player.name);
  push(player.id);
  for (const alias of player.aliases ?? []) push(alias);

  for (const source of [player.name, player.id, ...(player.aliases ?? [])]) {
    const tokens = splitWords(source);
    if (!tokens.length) continue;
    if (tokens[0] && tokens[0]!.length >= 3) push(tokens[0]);
    for (const token of tokens) {
      if (token.length >= 4) push(token);
    }
  }

  return [...out];
}

function scoreAlias(spoken: string, alias: string): number {
  if (!spoken || !alias) return 0;
  if (spoken === alias) return 1;
  if (alias.includes(spoken) || spoken.includes(alias)) return 0.92;
  const full = stringSimilarity(spoken, alias);
  const tokens = tokenSimilarity(spoken, alias);
  return Math.max(full, tokens * 0.95 + full * 0.05);
}

export function scorePlayerReference(spoken: string, player: VoicePlayerRef): number {
  const normalizedSpoken = normalizeVoiceName(spoken);
  const compactSpoken = normalizeCompact(spoken);
  if (!normalizedSpoken) return 0;

  let best = 0;
  for (const alias of buildPlayerAliases(player)) {
    best = Math.max(best, scoreAlias(normalizedSpoken, alias));
    if (compactSpoken && compactSpoken === alias.replace(/\s+/g, "")) {
      best = Math.max(best, 0.96);
    }
  }
  return best;
}

export function fuzzyResolvePlayerId(spoken: string, players: VoicePlayerRef[]): string | null {
  const normalized = normalizeVoiceName(spoken);
  if (!normalized) return null;

  const scored = players
    .map((player) => ({ id: player.id, score: scorePlayerReference(normalized, player) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < MIN_SCORE) return null;
  if (second && best.score - second.score < MIN_GAP) return null;
  return best.id;
}

export function detectPlayerMention(
  text: string,
  players: VoicePlayerRef[],
  selfPlayerId?: string
): { target: string; ambiguous: boolean } {
  const normalizedText = normalizeVoiceName(text);
  if (!normalizedText) {
    return { target: selfPlayerId ?? "self", ambiguous: false };
  }
  if (/\b(me|my|myself|self|i)\b/.test(normalizedText)) {
    return { target: selfPlayerId ?? "self", ambiguous: false };
  }

  const seatMatch = normalizedText.match(/\bplayer\s*(\d+)\b/);
  if (seatMatch) {
    const index = Number.parseInt(seatMatch[1] ?? "", 10) - 1;
    if (players[index]) return { target: players[index]!.id, ambiguous: false };
    return { target: selfPlayerId ?? "self", ambiguous: true };
  }

  const scored = players
    .map((player) => {
      const aliases = buildPlayerAliases(player);
      let score = 0;
      for (const alias of aliases) {
        if (normalizedText.includes(alias)) score = Math.max(score, alias.split(" ").length > 1 ? 1 : 0.9);
        for (const token of normalizedText.split(" ")) {
          if (token.length < 3) continue;
          if (alias === token) score = Math.max(score, 0.9);
          else if (alias.startsWith(token)) score = Math.max(score, 0.76);
          else score = Math.max(score, scoreAlias(token, alias) * 0.85);
        }
      }
      return { player, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return { target: selfPlayerId ?? "self", ambiguous: false };
  if (second && best.score - second.score < MIN_GAP) {
    return { target: selfPlayerId ?? "self", ambiguous: true };
  }
  return { target: best.player.id, ambiguous: best.score < MIN_SCORE };
}
