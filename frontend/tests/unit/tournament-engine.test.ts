import assert from "assert";
import {
  calculateStandings,
  createCommanderPodsRound,
  createDoubleEliminationPairings,
  createRoundRobinPairings,
  createSingleEliminationPairings,
  createSwissPairings,
  createTopCutPairings,
  type TournamentMatchForStandings,
  type TournamentParticipantForPairing,
} from "@/lib/mobile/tournament-engine";

const players: TournamentParticipantForPairing[] = [
  { id: "p1", seed: 1, display_name: "A" },
  { id: "p2", seed: 2, display_name: "B" },
  { id: "p3", seed: 3, display_name: "C" },
  { id: "p4", seed: 4, display_name: "D" },
  { id: "p5", seed: 5, display_name: "E" },
];

const round1 = createSwissPairings({ participants: players, previousMatches: [], roundNumber: 1 });
assert.equal(round1.length, 3, "odd player count creates two matches plus a bye");
assert.equal(round1[2].status, "bye", "last table is a bye");
assert.equal(round1[2].winnerParticipantId, "p5", "bye winner is assigned");

const matches: TournamentMatchForStandings[] = [
  {
    id: "m1",
    round_id: "r1",
    round_number: 1,
    phase: "swiss",
    player_a_id: "p1",
    player_b_id: "p2",
    winner_participant_id: "p1",
    result: "a_win",
    status: "confirmed",
    player_a_game_wins: 2,
    player_b_game_wins: 0,
    draws: 0,
  },
  {
    id: "m2",
    round_id: "r1",
    round_number: 1,
    phase: "swiss",
    player_a_id: "p3",
    player_b_id: "p4",
    winner_participant_id: "p4",
    result: "b_win",
    status: "confirmed",
    player_a_game_wins: 1,
    player_b_game_wins: 2,
    draws: 0,
  },
  {
    id: "m3",
    round_id: "r1",
    round_number: 1,
    phase: "swiss",
    player_a_id: "p5",
    player_b_id: null,
    winner_participant_id: "p5",
    result: "a_win",
    status: "bye",
    player_a_game_wins: 2,
    player_b_game_wins: 0,
    draws: 0,
  },
];

const standings = calculateStandings(players, matches);
assert.equal(standings[0].matchPoints, 3, "winner has 3 match points");
assert.ok(standings.find((s) => s.participantId === "p5")?.byes === 1, "bye is tracked");

const round2 = createSwissPairings({ participants: players, previousMatches: matches, roundNumber: 2 });
for (const pairing of round2) {
  if (!pairing.playerBId) continue;
  assert.notDeepEqual(
    [pairing.playerAId, pairing.playerBId].sort(),
    ["p1", "p2"],
    "round 2 avoids rematching p1 and p2 when possible",
  );
}

const topCut = createTopCutPairings(players, matches, 4);
assert.equal(topCut.length, 2, "top 4 creates semifinals");
assert.ok(topCut.every((p) => p.playerAId && p.playerBId), "top cut pairs all seats");

const singleElim = createSingleEliminationPairings(players.slice(0, 3), 1);
assert.equal(singleElim.length, 2, "single elimination pads odd bracket with a bye");
assert.equal(singleElim.filter((p) => p.status === "bye").length, 1, "single elimination bye is explicit");

const roundRobin = createRoundRobinPairings(players.slice(0, 4), 1);
assert.equal(roundRobin.length, 2, "round robin pairs every player in an even round");
const roundRobinOdd = createRoundRobinPairings(players.slice(0, 5), 1);
assert.equal(roundRobinOdd.length, 3, "round robin odd count includes a bye pairing");
assert.equal(roundRobinOdd.filter((p) => p.status === "bye").length, 1, "round robin odd count creates one bye");

const commanderPods = createCommanderPodsRound({ participants: players.concat([
  { id: "p6", seed: 6, display_name: "F" },
  { id: "p7", seed: 7, display_name: "G" },
  { id: "p8", seed: 8, display_name: "H" },
  { id: "p9", seed: 9, display_name: "I" },
  { id: "p10", seed: 10, display_name: "J" },
]), previousMatches: [], roundNumber: 1 });
assert.deepEqual(commanderPods.map((pod) => pod.participantIds.length), [4, 3, 3], "10 commander players split into 4/3/3 pods");

const doubleStart = createDoubleEliminationPairings({ participants: players.slice(0, 4), previousMatches: [], roundNumber: 1 });
assert.equal(doubleStart.phase, "double_elimination_winners", "double elimination starts in winners bracket");
assert.equal(doubleStart.pairings.length, 2, "double elimination starts with winners bracket pairings");

const grandFinalReset = createDoubleEliminationPairings({
  participants: players.slice(0, 2),
  roundNumber: 3,
  previousMatches: [
    {
      id: "gf1",
      round_id: "r-gf",
      round_number: 2,
      phase: "double_elimination_grand_final",
      player_a_id: "p1",
      player_b_id: "p2",
      winner_participant_id: "p2",
      result: "b_win",
      status: "confirmed",
      player_a_game_wins: 0,
      player_b_game_wins: 2,
      draws: 0,
    },
    {
      id: "loss1",
      round_id: "r-l",
      round_number: 1,
      phase: "double_elimination_winners",
      player_a_id: "p2",
      player_b_id: "p1",
      winner_participant_id: "p1",
      result: "b_win",
      status: "confirmed",
      player_a_game_wins: 0,
      player_b_game_wins: 2,
      draws: 0,
    },
  ],
});
assert.equal(grandFinalReset.phase, "double_elimination_grand_final", "double elimination reset stays in grand final phase");

console.log("tournament-engine tests passed");
