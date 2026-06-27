"use client";

export const TOURNAMENT_GUEST_HEADER = "X-Guest-Session-Token";
const GUEST_TOKEN_STORAGE_KEY = "manatap:tournament_guest_token";

export type TournamentFormat = "Commander" | "Standard" | "Pioneer" | "Modern" | "Pauper" | "Custom";
export type TournamentMode = "swiss" | "single_elimination" | "double_elimination" | "round_robin" | "commander_pods";
export type TournamentStatus = "registration" | "active" | "completed" | "cancelled";
export type TopCut = "none" | "top4" | "top8";
export type DeckSubmissionMode = "off" | "optional" | "required";
export type DeckVisibility = "host_only" | "players";
export type PairingMode = "auto" | "manual";
export type MatchResult = "a_win" | "b_win" | "draw";

export type PlayerArt = {
  source: "scryfall" | "color" | "none";
  scryfallCardId?: string;
  scryfallOracleId?: string;
  imageUrl?: string;
  colorHex?: string;
  title?: string;
  artist?: string;
  setCode?: string;
};

export type TournamentDeckCard = {
  name: string;
  qty: number;
  zone: "mainboard" | "sideboard";
};

export type TournamentDeckSubmission = {
  deckId?: string | null;
  deckName?: string | null;
  decklistText?: string | null;
  deckCards?: TournamentDeckCard[];
};

export type TournamentSettings = {
  tournamentMode?: TournamentMode;
  playerCap?: number;
  swissRounds?: number;
  topCut?: TopCut;
  podRounds?: number;
  roundRobinDrawsEnabled?: boolean;
  pairingMode?: PairingMode;
  decklistsEnabled?: boolean;
  deckSubmissionMode?: DeckSubmissionMode;
  deckVisibility?: DeckVisibility;
  deckLegalityCheckEnabled?: boolean;
  [key: string]: unknown;
};

export type TournamentVenue = {
  id: string;
  name: string;
  location?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TournamentInvite = {
  token?: string;
  url?: string;
  expiresAt?: string;
};

export type TournamentParticipant = {
  id: string;
  displayName: string;
  art: PlayerArt | Record<string, unknown> | null;
  deckId: string | null;
  deckName: string | null;
  deckSource: "none" | "saved" | "pasted";
  deckSubmitted: boolean;
  deckVisible: boolean;
  deck: null | {
    source: "none" | "saved" | "pasted";
    deckId: string | null;
    name: string | null;
    decklistText: string | null;
    cards: TournamentDeckCard[];
    submittedAt: string | null;
    updatedAt: string | null;
  };
  seed: number;
  dropped: boolean;
  joinedAt: string;
};

export type TournamentRound = {
  id: string;
  roundNumber: number;
  phase: string;
  status: "pairing" | "active" | "completed";
  stageOrder: number;
  label: string;
  completedAt: string | null;
};

export type TournamentMatch = {
  id: string;
  roundId: string;
  tableNumber: number;
  playerAId: string | null;
  playerBId: string | null;
  playerAGameWins: number;
  playerBGameWins: number;
  draws: number;
  result: MatchResult | null;
  status: "pending" | "reported" | "confirmed" | "disputed" | "bye";
  winnerParticipantId: string | null;
  reportedByParticipantId: string | null;
  confirmedByParticipantId: string | null;
  disputedByParticipantId: string | null;
  bracketSlot: string | null;
  sourceLabel: string | null;
  nextMatchHint: string | null;
  loserNextMatchHint: string | null;
  resultPayload: Record<string, unknown>;
};

export type TournamentPod = {
  id: string;
  roundId: string;
  tableNumber: number;
  status: "pending" | "reported" | "confirmed" | "disputed";
  winnerParticipantId: string | null;
  reportedWinnerParticipantId: string | null;
  reportedByParticipantId: string | null;
  disputedByParticipantId: string | null;
  reportedAt: string | null;
  confirmedAt: string | null;
  resultPayload: Record<string, unknown>;
};

export type TournamentPodEntry = {
  id: string;
  podId: string;
  roundId: string;
  participantId: string;
  seatNumber: number;
  points: number;
  placement: number | null;
  dropped: boolean;
};

export type TournamentPodConfirmation = {
  id: string;
  podId: string;
  roundId: string;
  participantId: string;
  action: "confirm" | "dispute";
  createdAt: string;
  updatedAt: string;
};

export type TournamentEvent = {
  id: string;
  type: string;
  actorParticipantId?: string | null;
  payload?: Record<string, unknown>;
  message?: string;
  createdAt: string;
  roundId?: string | null;
  matchId?: string | null;
  podId?: string | null;
  participantId?: string | null;
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

export type TournamentSnapshot = {
  id: string;
  title: string;
  format: TournamentFormat | string;
  mode: TournamentMode;
  status: TournamentStatus;
  structure: string;
  currentRound: number;
  settings: TournamentSettings;
  overallWinnerParticipantId: string | null;
  venue: TournamentVenue | null;
  isHost: boolean;
  me: TournamentParticipant | null;
  invite: TournamentInvite | null;
  participants: TournamentParticipant[];
  rounds: TournamentRound[];
  matches: TournamentMatch[];
  pods: TournamentPod[];
  podEntries: TournamentPodEntry[];
  podConfirmations: TournamentPodConfirmation[];
  hostEvents: TournamentEvent[];
  activityEvents: TournamentEvent[];
  standings: TournamentStanding[];
  updatedAt: string;
  endedAt: string | null;
};

export type TournamentPreview = {
  id: string;
  title: string;
  format: TournamentFormat | string;
  mode: TournamentMode;
  status: TournamentStatus;
  settings: TournamentSettings;
  venue: TournamentVenue | null;
  participantCount: number;
};

export type TournamentListRow = {
  id: string;
  title: string;
  format: TournamentFormat | string;
  mode: TournamentMode;
  status: TournamentStatus;
  current_round: number;
  created_at: string;
  updated_at: string;
  participant_count?: number;
  active_participant_count?: number;
  participants_preview?: Array<{ display_name: string; joined_at: string; dropped: boolean }>;
};

export type CreateTournamentInput = {
  venueId?: string | null;
  title: string;
  format: TournamentFormat;
  mode: TournamentMode;
  playerCap: number;
  swissRounds: number;
  topCut: TopCut;
  podRounds: number;
  roundRobinDrawsEnabled: boolean;
  pairingMode: PairingMode;
  decklistsEnabled: boolean;
  deckSubmissionMode: DeckSubmissionMode;
  deckVisibility: DeckVisibility;
  deckLegalityCheckEnabled: boolean;
};

export type ManualPairing = {
  tableNumber: number;
  playerAId: string;
  playerBId?: string | null;
};

export type ManualPod = {
  tableNumber: number;
  participantIds: string[];
};

export type ManualRoundBody = {
  manualPairings?: ManualPairing[];
  manualPods?: ManualPod[];
  allowRematches?: boolean;
};

export type SavedDeckSummary = {
  id: string;
  title: string;
  name?: string | null;
  format?: string | null;
  commander?: string | null;
  deck_text?: string | null;
  card_count?: number | null;
};

export type ImportedDeckResponse = {
  ok: true;
  source: "moxfield" | "archidekt";
  title: string;
  format: string;
  deckText: string;
};

export class TournamentApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "TournamentApiError";
    this.status = status;
    this.details = details;
  }
}

function makeBrowserToken(): string {
  if (!globalThis.crypto?.getRandomValues) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getTournamentGuestToken(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
  if (existing && existing.length >= 32) return existing;
  const token = makeBrowserToken();
  window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  document.cookie = `guest_session_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  return token;
}

export function extractTournamentToken(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.searchParams.get("tournamentToken") ?? url.searchParams.get("token") ?? raw;
  } catch {
    return raw;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: { guest?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (options.guest) headers.set(TOURNAMENT_GUEST_HEADER, getTournamentGuestToken());
  // eslint-disable-next-line no-restricted-globals -- Tournament routes need same-origin cookies plus a guest header and custom error parsing.
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.ok === false) {
    throw new TournamentApiError(String(json.error || `Request failed (${response.status})`), response.status, json.details);
  }
  return json as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export async function listTournamentVenues(): Promise<TournamentVenue[]> {
  const json = await requestJson<{ ok: true; venues: TournamentVenue[] }>("/api/mobile/tournaments/venues");
  return json.venues;
}

export async function saveTournamentVenue(input: { id?: string; name: string; location?: string }): Promise<TournamentVenue> {
  const json = await requestJson<{ ok: true; venue: TournamentVenue }>("/api/mobile/tournaments/venues", {
    method: "POST",
    body: jsonBody(input),
  });
  return json.venue;
}

export async function deleteTournamentVenue(id: string): Promise<void> {
  await requestJson<{ ok: true; deleted: true }>(`/api/mobile/tournaments/venues?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function listTournaments(): Promise<{ hosted: TournamentListRow[]; joined: TournamentListRow[] }> {
  const json = await requestJson<{ ok: true; hosted: TournamentListRow[]; joined: TournamentListRow[] }>("/api/mobile/tournaments");
  return { hosted: json.hosted, joined: json.joined };
}

export async function createTournament(input: CreateTournamentInput): Promise<{ tournament: TournamentSnapshot; invite: TournamentInvite }> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot; invite: TournamentInvite }>("/api/mobile/tournaments", {
    method: "POST",
    body: jsonBody(input),
  });
  return { tournament: json.tournament, invite: json.invite };
}

export async function getTournament(id: string, guest = true): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}`, {}, { guest });
  return json.tournament;
}

export async function updateTournament(id: string, input: Partial<CreateTournamentInput>): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: jsonBody(input),
  });
  return json.tournament;
}

export async function refreshTournamentInvite(id: string): Promise<TournamentInvite> {
  const json = await requestJson<{ ok: true; invite: TournamentInvite }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/invite`, {
    method: "POST",
    body: jsonBody({}),
  });
  return json.invite;
}

export async function previewTournamentInvite(tokenOrUrl: string): Promise<TournamentPreview> {
  const json = await requestJson<{ ok: true; preview: TournamentPreview }>("/api/mobile/tournaments/preview", {
    method: "POST",
    body: jsonBody({ inviteUrl: tokenOrUrl }),
  }, { guest: true });
  return json.preview;
}

export async function joinTournament(input: {
  inviteUrl: string;
  displayName: string;
  art: PlayerArt;
} & TournamentDeckSubmission): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>("/api/mobile/tournaments/join", {
    method: "POST",
    body: jsonBody(input),
  }, { guest: true });
  return json.tournament;
}

export async function startTournament(id: string, body?: ManualRoundBody): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/start`, {
    method: "POST",
    body: jsonBody(body ?? {}),
  }, { guest: true });
  return json.tournament;
}

export async function advanceTournament(id: string, body?: ManualRoundBody): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/advance`, {
    method: "POST",
    body: jsonBody(body ?? {}),
  }, { guest: true });
  return json.tournament;
}

export async function endTournament(id: string): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/end`, {
    method: "POST",
    body: jsonBody({}),
  }, { guest: true });
  return json.tournament;
}

export async function declareTournamentWinner(id: string, participantId: string): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/winner`, {
    method: "POST",
    body: jsonBody({ participantId }),
  }, { guest: true });
  return json.tournament;
}

export async function addTestParticipants(id: string, count: number): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/test-participants`, {
    method: "POST",
    body: jsonBody({ count }),
  }, { guest: true });
  return json.tournament;
}

export async function deleteTournament(id: string): Promise<void> {
  await requestJson<{ ok: true; deleted: true }>(`/api/mobile/tournaments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function dropTournamentParticipant(id: string, participantId?: string, reason?: "leave" | "kick"): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/drop`, {
    method: "POST",
    body: jsonBody({ participantId, reason }),
  }, { guest: true });
  return json.tournament;
}

export async function reportTournamentIssue(id: string, message: string): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/issue`, {
    method: "POST",
    body: jsonBody({ message }),
  }, { guest: true });
  return json.tournament;
}

export async function updateTournamentDeck(id: string, input: TournamentDeckSubmission & { participantId?: string }): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(`/api/mobile/tournaments/${encodeURIComponent(id)}/deck`, {
    method: "POST",
    body: jsonBody(input),
  }, { guest: true });
  return json.tournament;
}

export async function reportMatchResult(id: string, roundId: string, input: {
  matchId: string;
  result: MatchResult;
  playerAGameWins: number;
  playerBGameWins: number;
  draws: number;
}): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/rounds/${encodeURIComponent(roundId)}/report`,
    { method: "POST", body: jsonBody(input) },
    { guest: true },
  );
  return json.tournament;
}

export async function confirmMatchResult(id: string, roundId: string, matchId: string, action: "confirm" | "dispute"): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/rounds/${encodeURIComponent(roundId)}/confirm`,
    { method: "POST", body: jsonBody({ matchId, action }) },
    { guest: true },
  );
  return json.tournament;
}

export async function overrideMatchResult(id: string, matchId: string, input: {
  result: MatchResult;
  playerAGameWins: number;
  playerBGameWins: number;
  draws: number;
  note?: string;
}): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/override`,
    { method: "POST", body: jsonBody({ matchId, ...input }) },
    { guest: true },
  );
  return json.tournament;
}

export async function reportPodResult(id: string, podId: string, winnerParticipantId: string, note?: string): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/pods/${encodeURIComponent(podId)}/result`,
    { method: "POST", body: jsonBody({ winnerParticipantId, note }) },
    { guest: true },
  );
  return json.tournament;
}

export async function confirmPodResult(id: string, podId: string, action: "confirm" | "dispute"): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/pods/${encodeURIComponent(podId)}/confirm`,
    { method: "POST", body: jsonBody({ action }) },
    { guest: true },
  );
  return json.tournament;
}

export async function reseatTournamentPods(id: string, roundId: string, assignments: Array<{ participantId: string; podId: string }>): Promise<TournamentSnapshot> {
  const json = await requestJson<{ ok: true; tournament: TournamentSnapshot }>(
    `/api/mobile/tournaments/${encodeURIComponent(id)}/pods/reseat`,
    { method: "POST", body: jsonBody({ roundId, assignments }) },
    { guest: true },
  );
  return json.tournament;
}

export async function importDeckUrl(url: string): Promise<ImportedDeckResponse> {
  return requestJson<ImportedDeckResponse>("/api/decks/import-url", {
    method: "POST",
    body: jsonBody({ url }),
  }, { guest: true });
}

export async function listSavedDecks(): Promise<SavedDeckSummary[]> {
  const json = await requestJson<{ decks?: SavedDeckSummary[] }>("/api/decks/my");
  return Array.isArray(json.decks) ? json.decks : [];
}
