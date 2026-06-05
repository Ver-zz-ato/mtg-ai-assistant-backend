export type TournamentPhase = "swiss" | "top_cut";
export type TournamentMatchStatus = "pending" | "reported" | "confirmed" | "disputed" | "bye";
export type TournamentResult = "a_win" | "b_win" | "draw";

export type TournamentParticipantForPairing = {
  id: string;
  seed: number;
  display_name: string;
  dropped?: boolean | null;
};

export type TournamentMatchForStandings = {
  id: string;
  round_id: string;
  round_number: number;
  phase: TournamentPhase;
  player_a_id: string | null;
  player_b_id: string | null;
  winner_participant_id: string | null;
  result: TournamentResult | null;
  status: TournamentMatchStatus;
  player_a_game_wins?: number | null;
  player_b_game_wins?: number | null;
  draws?: number | null;
};

export type TournamentStanding = {
  participantId: string;
  rank: number;
  seed: number;
  matchPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  opponentMatchWinPct: number;
  gameWinPct: number;
  opponentGameWinPct: number;
};

export type PairingInput = {
  participants: TournamentParticipantForPairing[];
  previousMatches: TournamentMatchForStandings[];
  roundNumber: number;
  phase?: TournamentPhase;
  topCutSize?: number;
};

export type PairingRow = {
  tableNumber: number;
  playerAId: string;
  playerBId: string | null;
  status: TournamentMatchStatus;
  result: TournamentResult | null;
  winnerParticipantId: string | null;
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0.333333;
  return Math.max(0.333333, numerator / denominator);
}

function confirmedMatches(matches: TournamentMatchForStandings[]): TournamentMatchForStandings[] {
  return matches.filter((m) => m.status === "confirmed" || m.status === "bye");
}

function participantOpponents(participantId: string, matches: TournamentMatchForStandings[]): string[] {
  const out: string[] = [];
  for (const match of confirmedMatches(matches)) {
    if (match.player_a_id === participantId && match.player_b_id) out.push(match.player_b_id);
    if (match.player_b_id === participantId && match.player_a_id) out.push(match.player_a_id);
  }
  return out;
}

export function calculateStandings(
  participants: TournamentParticipantForPairing[],
  matches: TournamentMatchForStandings[],
): TournamentStanding[] {
  const stats = new Map<string, Omit<TournamentStanding, "rank" | "opponentMatchWinPct" | "gameWinPct" | "opponentGameWinPct">>();
  for (const participant of participants) {
    stats.set(participant.id, {
      participantId: participant.id,
      seed: participant.seed,
      matchPoints: 0,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
    });
  }

  for (const match of confirmedMatches(matches)) {
    const a = match.player_a_id ? stats.get(match.player_a_id) : null;
    const b = match.player_b_id ? stats.get(match.player_b_id) : null;
    const aGames = Math.max(0, Number(match.player_a_game_wins ?? 0));
    const bGames = Math.max(0, Number(match.player_b_game_wins ?? 0));
    const draws = Math.max(0, Number(match.draws ?? 0));

    if (a && !b && match.status === "bye") {
      a.matchPoints += 3;
      a.matchesPlayed += 1;
      a.wins += 1;
      a.byes += 1;
      a.gameWins += Math.max(2, aGames || 2);
      continue;
    }

    if (!a || !b) continue;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    a.gameWins += aGames;
    a.gameLosses += bGames;
    a.gameDraws += draws;
    b.gameWins += bGames;
    b.gameLosses += aGames;
    b.gameDraws += draws;

    if (match.result === "draw") {
      a.matchPoints += 1;
      b.matchPoints += 1;
      a.draws += 1;
      b.draws += 1;
    } else if (match.winner_participant_id === a.participantId || match.result === "a_win") {
      a.matchPoints += 3;
      a.wins += 1;
      b.losses += 1;
    } else if (match.winner_participant_id === b.participantId || match.result === "b_win") {
      b.matchPoints += 3;
      b.wins += 1;
      a.losses += 1;
    }
  }

  const provisional = [...stats.values()].map((s) => {
    const gameWinPct = pct(s.gameWins + s.gameDraws * 0.5, s.gameWins + s.gameLosses + s.gameDraws);
    const opponents = participantOpponents(s.participantId, matches);
    const oppMatch = opponents
      .map((id) => stats.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const opponentMatchWinPct =
      oppMatch.length === 0
        ? 0.333333
        : oppMatch.reduce((sum, o) => sum + pct(o.matchPoints, o.matchesPlayed * 3), 0) / oppMatch.length;
    const opponentGameWinPct =
      oppMatch.length === 0
        ? 0.333333
        : oppMatch.reduce(
            (sum, o) => sum + pct(o.gameWins + o.gameDraws * 0.5, o.gameWins + o.gameLosses + o.gameDraws),
            0,
          ) / oppMatch.length;
    return { ...s, rank: 0, opponentMatchWinPct, gameWinPct, opponentGameWinPct };
  });

  provisional.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.opponentMatchWinPct !== a.opponentMatchWinPct) return b.opponentMatchWinPct - a.opponentMatchWinPct;
    if (b.gameWinPct !== a.gameWinPct) return b.gameWinPct - a.gameWinPct;
    if (b.opponentGameWinPct !== a.opponentGameWinPct) return b.opponentGameWinPct - a.opponentGameWinPct;
    return a.seed - b.seed;
  });

  return provisional.map((standing, index) => ({ ...standing, rank: index + 1 }));
}

function hasPlayed(a: string, b: string, matches: TournamentMatchForStandings[]): boolean {
  return confirmedMatches(matches).some(
    (match) =>
      (match.player_a_id === a && match.player_b_id === b) ||
      (match.player_a_id === b && match.player_b_id === a),
  );
}

export function createSwissPairings(input: PairingInput): PairingRow[] {
  const active = input.participants.filter((p) => !p.dropped);
  const standings = calculateStandings(active, input.previousMatches);
  const ordered =
    input.roundNumber <= 1
      ? [...active].sort((a, b) => a.seed - b.seed)
      : standings.map((s) => active.find((p) => p.id === s.participantId)).filter(Boolean) as TournamentParticipantForPairing[];
  const remaining = [...ordered];
  const pairings: PairingRow[] = [];

  while (remaining.length > 0) {
    const a = remaining.shift();
    if (!a) break;
    if (remaining.length === 0) {
      pairings.push({
        tableNumber: pairings.length + 1,
        playerAId: a.id,
        playerBId: null,
        status: "bye",
        result: "a_win",
        winnerParticipantId: a.id,
      });
      break;
    }

    let opponentIndex = remaining.findIndex((candidate) => !hasPlayed(a.id, candidate.id, input.previousMatches));
    if (opponentIndex < 0) opponentIndex = 0;
    const [b] = remaining.splice(opponentIndex, 1);
    pairings.push({
      tableNumber: pairings.length + 1,
      playerAId: a.id,
      playerBId: b.id,
      status: "pending",
      result: null,
      winnerParticipantId: null,
    });
  }

  return pairings;
}

export function createTopCutPairings(
  participants: TournamentParticipantForPairing[],
  matches: TournamentMatchForStandings[],
  topCutSize: number,
): PairingRow[] {
  const size = topCutSize === 8 ? 8 : topCutSize === 4 ? 4 : 0;
  if (!size) return [];
  const cut = calculateStandings(participants.filter((p) => !p.dropped), matches).slice(0, size);
  const seeds = cut.map((s) => s.participantId);
  const pairs = size === 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : [[0, 3], [1, 2]];
  return pairs
    .filter(([a, b]) => seeds[a] && seeds[b])
    .map(([a, b], index) => ({
      tableNumber: index + 1,
      playerAId: seeds[a],
      playerBId: seeds[b],
      status: "pending" as const,
      result: null,
      winnerParticipantId: null,
    }));
}

export function allRoundMatchesResolved(matches: TournamentMatchForStandings[]): boolean {
  return matches.length > 0 && matches.every((m) => m.status === "confirmed" || m.status === "bye");
}
