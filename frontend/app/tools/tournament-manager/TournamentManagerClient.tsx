"use client";

/* eslint-disable @next/next/no-img-element -- This page renders generated QR data URLs and runtime card-art thumbnails. */

import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  Clipboard,
  Crown,
  Flag,
  Link2,
  Loader2,
  Medal,
  Palette,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Shuffle,
  Swords,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  addTestParticipants,
  advanceTournament,
  confirmMatchResult,
  confirmPodResult,
  createTournament,
  declareTournamentWinner,
  deleteTournament,
  deleteTournamentVenue,
  dropTournamentParticipant,
  endTournament,
  extractTournamentToken,
  getTournament,
  getTournamentGuestToken,
  importDeckUrl,
  joinTournament,
  listSavedDecks,
  listTournamentVenues,
  listTournaments,
  overrideMatchResult,
  previewTournamentInvite,
  refreshTournamentInvite,
  reportMatchResult,
  reportPodResult,
  reportTournamentIssue,
  reseatTournamentPods,
  saveTournamentVenue,
  startTournament,
  updateTournament,
  updateTournamentDeck,
  type CreateTournamentInput,
  type DeckSubmissionMode,
  type DeckVisibility,
  type ManualPairing,
  type ManualPod,
  type MatchResult,
  type PairingMode,
  type PlayerArt,
  type SavedDeckSummary,
  type TournamentDeckCard,
  type TournamentFormat,
  type TournamentInvite,
  type TournamentListRow,
  type TournamentMatch,
  type TournamentMode,
  type TournamentParticipant,
  type TournamentPod,
  type TournamentPreview,
  type TournamentRound,
  type TournamentSnapshot,
  type TournamentVenue,
  type TopCut,
} from "@/lib/tournaments/web-client";

type Role = "landing" | "host" | "player";
type Notice = { type: "success" | "error" | "info"; message: string } | null;
type DeckInputMode = "none" | "saved" | "pasted" | "import";
type WorkspaceTab = "rounds" | "players" | "standings" | "activity" | "settings";

type ArtSearchResult = {
  name: string;
  imageUrl?: string;
  normalUrl?: string;
};

type ResultDraft = {
  result: MatchResult;
  playerAGameWins: number;
  playerBGameWins: number;
  draws: number;
  note: string;
};

const ACTIVE_TOURNAMENT_STORAGE_KEY = "manatap:tournament_manager_active_id";

const FORMATS: TournamentFormat[] = ["Commander", "Standard", "Pioneer", "Modern", "Pauper", "Custom"];

const MODE_OPTIONS: Array<{ value: TournamentMode; label: string; help: string }> = [
  { value: "swiss", label: "Swiss + Top Cut", help: "Best for store events and repeated rounds." },
  { value: "single_elimination", label: "Single Elim", help: "Fast bracket with one loss out." },
  { value: "double_elimination", label: "Double Elim", help: "Winners and losers brackets." },
  { value: "round_robin", label: "Round Robin", help: "Everyone plays everyone, capped at 16 players." },
  { value: "commander_pods", label: "Commander Pods", help: "3-4 player pods with pod points." },
];

const TOP_CUT_OPTIONS: Array<{ value: TopCut; label: string }> = [
  { value: "none", label: "No top cut" },
  { value: "top4", label: "Top 4" },
  { value: "top8", label: "Top 8" },
];

const DECK_MODES: Array<{ value: DeckSubmissionMode; label: string }> = [
  { value: "off", label: "No decklists" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];

const ART_SWATCHES = ["#f59e0b", "#22d3ee", "#a78bfa", "#34d399", "#fb7185", "#f8fafc", "#111827"];

const DEFAULT_SETUP: CreateTournamentInput = {
  venueId: null,
  title: "",
  format: "Commander",
  mode: "swiss",
  playerCap: 32,
  swissRounds: 3,
  topCut: "none",
  podRounds: 3,
  roundRobinDrawsEnabled: true,
  pairingMode: "auto",
  decklistsEnabled: true,
  deckSubmissionMode: "optional",
  deckVisibility: "host_only",
  deckLegalityCheckEnabled: false,
};

const DEFAULT_ART: PlayerArt = {
  source: "color",
  colorHex: "#f59e0b",
  title: "ManaTap player",
};

const REALTIME_TABLES = [
  { table: "tournaments", filterColumn: "id" },
  { table: "tournament_participants", filterColumn: "tournament_id" },
  { table: "tournament_rounds", filterColumn: "tournament_id" },
  { table: "tournament_matches", filterColumn: "tournament_id" },
  { table: "tournament_pods", filterColumn: "tournament_id" },
  { table: "tournament_pod_entries", filterColumn: "tournament_id" },
  { table: "tournament_pod_confirmations", filterColumn: "tournament_id" },
  { table: "tournament_events", filterColumn: "tournament_id" },
];

const CONTROL_CLASS =
  "w-full min-w-0 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-neutral-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10 disabled:cursor-not-allowed disabled:opacity-55";

function modeLabel(mode: TournamentMode | string): string {
  return MODE_OPTIONS.find((item) => item.value === mode)?.label ?? String(mode).replaceAll("_", " ");
}

function deckModeLabel(mode?: DeckSubmissionMode): string {
  return DECK_MODES.find((item) => item.value === mode)?.label ?? "Optional";
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "33%";
  return `${Math.round(value * 100)}%`;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function participantName(tournament: TournamentSnapshot | null, id?: string | null): string {
  if (!id) return "Bye";
  return tournament?.participants.find((participant) => participant.id === id)?.displayName ?? "Unknown player";
}

function activeParticipants(tournament: TournamentSnapshot | null): TournamentParticipant[] {
  return (tournament?.participants ?? []).filter((participant) => !participant.dropped);
}

function currentRound(tournament: TournamentSnapshot | null): TournamentRound | null {
  if (!tournament?.rounds.length) return null;
  const active = tournament.rounds.find((round) => round.status !== "completed");
  return active ?? tournament.rounds[tournament.rounds.length - 1] ?? null;
}

function matchesForRound(tournament: TournamentSnapshot | null, roundId?: string | null): TournamentMatch[] {
  if (!tournament || !roundId) return [];
  return tournament.matches.filter((match) => match.roundId === roundId).sort((a, b) => a.tableNumber - b.tableNumber);
}

function podsForRound(tournament: TournamentSnapshot | null, roundId?: string | null): TournamentPod[] {
  if (!tournament || !roundId) return [];
  return tournament.pods.filter((pod) => pod.roundId === roundId).sort((a, b) => a.tableNumber - b.tableNumber);
}

function settingsFromTournament(tournament: TournamentSnapshot): CreateTournamentInput {
  return {
    venueId: tournament.venue?.id ?? null,
    title: tournament.title,
    format: FORMATS.includes(tournament.format as TournamentFormat) ? (tournament.format as TournamentFormat) : "Custom",
    mode: tournament.mode,
    playerCap: Number(tournament.settings.playerCap ?? 32),
    swissRounds: Number(tournament.settings.swissRounds ?? 3),
    topCut: (tournament.settings.topCut as TopCut) ?? "none",
    podRounds: Number(tournament.settings.podRounds ?? 3),
    roundRobinDrawsEnabled: tournament.settings.roundRobinDrawsEnabled !== false,
    pairingMode: (tournament.settings.pairingMode as PairingMode) ?? "auto",
    decklistsEnabled: tournament.settings.decklistsEnabled !== false,
    deckSubmissionMode: (tournament.settings.deckSubmissionMode as DeckSubmissionMode) ?? "optional",
    deckVisibility: (tournament.settings.deckVisibility as DeckVisibility) ?? "host_only",
    deckLegalityCheckEnabled: tournament.settings.deckLegalityCheckEnabled === true,
  };
}

function parseDeckCards(text: string): TournamentDeckCard[] {
  const cards = new Map<string, TournamentDeckCard>();
  let zone: "mainboard" | "sideboard" = "mainboard";
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    if (/^(sideboard|side board|sb)$/i.test(line)) {
      zone = "sideboard";
      continue;
    }
    if (/^(mainboard|main deck|deck)$/i.test(line)) {
      zone = "mainboard";
      continue;
    }
    if (/^(sb|sideboard)\s*[:\-]/i.test(line)) {
      zone = "sideboard";
      line = line.replace(/^(sb|sideboard)\s*[:\-]\s*/i, "");
    }
    if (/^(cmdr|commander)\s*[:\-]/i.test(line)) {
      zone = "mainboard";
      line = line.replace(/^(cmdr|commander)\s*[:\-]\s*/i, "");
    }
    line = line.replace(/\s+\[[^\]]+\]\s*$/i, "").replace(/\s+\([A-Z0-9]{2,6}\)\s*\d*.*$/i, "").trim();
    const lead = line.match(/^(?:x\s*)?(\d{1,3})\s*x?\s+(.+)$/i);
    const tail = line.match(/^(.+?)\s+x\s*(\d{1,3})$/i);
    const qty = lead ? Number(lead[1]) : tail ? Number(tail[2]) : 1;
    const name = (lead ? lead[2] : tail ? tail[1] : line).replace(/\s+/g, " ").trim();
    if (!name || !Number.isFinite(qty) || qty < 1) continue;
    const key = `${zone}:${name.toLowerCase()}`;
    const existing = cards.get(key);
    if (existing) existing.qty += Math.min(Math.floor(qty), 999);
    else cards.set(key, { name, qty: Math.min(Math.floor(qty), 999), zone });
    if (cards.size >= 300) break;
  }
  return [...cards.values()];
}

function renderedDeckCount(cards: TournamentDeckCard[]): string {
  const main = cards.filter((card) => card.zone === "mainboard").reduce((sum, card) => sum + card.qty, 0);
  const side = cards.filter((card) => card.zone === "sideboard").reduce((sum, card) => sum + card.qty, 0);
  return side ? `${main} main, ${side} side` : `${main} cards`;
}

function defaultResultDraft(match?: TournamentMatch): ResultDraft {
  if (!match) {
    return { result: "a_win", playerAGameWins: 2, playerBGameWins: 0, draws: 0, note: "" };
  }
  return {
    result: match.result ?? "a_win",
    playerAGameWins: match.playerAGameWins || (match.result === "b_win" ? 0 : 2),
    playerBGameWins: match.playerBGameWins || (match.result === "b_win" ? 2 : 0),
    draws: match.draws || 0,
    note: "",
  };
}

function resultLabel(match: TournamentMatch, tournament: TournamentSnapshot): string {
  if (match.status === "bye") return `${participantName(tournament, match.winnerParticipantId ?? match.playerAId)} gets a bye`;
  if (!match.result) return "Waiting for result";
  if (match.result === "draw") return `Draw ${match.playerAGameWins}-${match.playerBGameWins}-${match.draws}`;
  return `${participantName(tournament, match.winnerParticipantId)} wins ${match.playerAGameWins}-${match.playerBGameWins}`;
}

function canActOnMatch(match: TournamentMatch, tournament: TournamentSnapshot): boolean {
  if (tournament.isHost) return true;
  const me = tournament.me?.id;
  return Boolean(me && (match.playerAId === me || match.playerBId === me));
}

function canConfirmMatch(match: TournamentMatch, tournament: TournamentSnapshot): boolean {
  if (tournament.isHost) return match.status === "reported" || match.status === "disputed";
  const me = tournament.me?.id;
  return Boolean(me && match.status === "reported" && match.reportedByParticipantId !== me && (match.playerAId === me || match.playerBId === me));
}

function buildDefaultManualPairings(tournament: TournamentSnapshot): ManualPairing[] {
  const players = activeParticipants(tournament);
  const out: ManualPairing[] = [];
  for (let index = 0; index < players.length; index += 2) {
    out.push({
      tableNumber: Math.floor(index / 2) + 1,
      playerAId: players[index]?.id ?? "",
      playerBId: players[index + 1]?.id ?? null,
    });
  }
  return out.filter((row) => row.playerAId);
}

function buildDefaultManualPods(tournament: TournamentSnapshot): ManualPod[] {
  const players = activeParticipants(tournament);
  const pods: ManualPod[] = [];
  for (let index = 0; index < players.length; index += 4) {
    const participantIds = players.slice(index, index + 4).map((participant) => participant.id);
    if (participantIds.length >= 3) pods.push({ tableNumber: pods.length + 1, participantIds });
  }
  return pods;
}

function normalizeManualBody(tournament: TournamentSnapshot | null, pairings: ManualPairing[], pods: ManualPod[], allowRematches: boolean) {
  if (!tournament) return {};
  if (tournament.mode === "commander_pods") {
    const manualPods = pods
      .map((pod, index) => ({
        tableNumber: index + 1,
        participantIds: pod.participantIds.filter(Boolean),
      }))
      .filter((pod) => pod.participantIds.length >= 3);
    return manualPods.length ? { manualPods, allowRematches } : {};
  }
  const manualPairings = pairings
    .map((pairing, index) => ({
      tableNumber: index + 1,
      playerAId: pairing.playerAId,
      playerBId: pairing.playerBId || null,
    }))
    .filter((pairing) => pairing.playerAId);
  return manualPairings.length ? { manualPairings, allowRematches } : {};
}

function storageSetActiveTournament(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_TOURNAMENT_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function storageGetActiveTournament(): string {
  try {
    return window.localStorage.getItem(ACTIVE_TOURNAMENT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function TournamentManagerClient({ initialToken }: { initialToken?: string }) {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<Role>(initialToken ? "player" : "landing");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("rounds");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<"idle" | "live" | "fallback">("idle");
  const [savedTournamentId, setSavedTournamentId] = useState("");

  const [venues, setVenues] = useState<TournamentVenue[]>([]);
  const [hosted, setHosted] = useState<TournamentListRow[]>([]);
  const [joined, setJoined] = useState<TournamentListRow[]>([]);
  const [setup, setSetup] = useState<CreateTournamentInput>(DEFAULT_SETUP);
  const [venueDraft, setVenueDraft] = useState({ name: "", location: "" });
  const [invite, setInvite] = useState<TournamentInvite | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [tokenInput, setTokenInput] = useState(initialToken ?? "");
  const [preview, setPreview] = useState<TournamentPreview | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [art, setArt] = useState<PlayerArt>(DEFAULT_ART);
  const [artQuery, setArtQuery] = useState("");
  const [artResults, setArtResults] = useState<ArtSearchResult[]>([]);
  const [deckMode, setDeckMode] = useState<DeckInputMode>("none");
  const [deckName, setDeckName] = useState("");
  const [deckText, setDeckText] = useState("");
  const [deckImportUrl, setDeckImportUrl] = useState("");
  const [selectedSavedDeckId, setSelectedSavedDeckId] = useState("");
  const [savedDecks, setSavedDecks] = useState<SavedDeckSummary[]>([]);

  const [tournament, setTournament] = useState<TournamentSnapshot | null>(null);
  const [manualPairings, setManualPairings] = useState<ManualPairing[]>([]);
  const [manualPods, setManualPods] = useState<ManualPod[]>([]);
  const [allowRematches, setAllowRematches] = useState(false);
  const [winnerParticipantId, setWinnerParticipantId] = useState("");
  const [issueText, setIssueText] = useState("");
  const [podWinners, setPodWinners] = useState<Record<string, string>>({});
  const [resultDrafts, setResultDrafts] = useState<Record<string, ResultDraft>>({});
  const [reseatDraft, setReseatDraft] = useState<Record<string, string>>({});
  const [hostDeckParticipantId, setHostDeckParticipantId] = useState("");

  const refreshTimer = useRef<number | null>(null);

  const deckCards = useMemo(() => parseDeckCards(deckText), [deckText]);
  const current = useMemo(() => currentRound(tournament), [tournament]);
  const currentMatches = useMemo(() => matchesForRound(tournament, current?.id), [tournament, current?.id]);
  const currentPods = useMemo(() => podsForRound(tournament, current?.id), [tournament, current?.id]);
  const activePlayers = useMemo(() => activeParticipants(tournament), [tournament]);
  const deckRequirement = (preview?.settings.deckSubmissionMode as DeckSubmissionMode | undefined) ?? "optional";
  const isDev = process.env.NODE_ENV !== "production";

  const appInviteUrl = useMemo(() => {
    const token = extractTournamentToken(tokenInput);
    return token ? `manatap://app/tournament?tournamentToken=${encodeURIComponent(token)}` : "manatap://";
  }, [tokenInput]);

  const run = useCallback(async <T,>(label: string, action: () => Promise<T>, onSuccess?: (value: T) => void | Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      const value = await action();
      await onSuccess?.(value);
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ type: "error", message });
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const loadHostDashboard = useCallback(async () => {
    if (!user) return;
    await run("load-host", async () => {
      const [venueRows, tournamentRows] = await Promise.all([listTournamentVenues(), listTournaments()]);
      return { venueRows, tournamentRows };
    }, ({ venueRows, tournamentRows }) => {
      setVenues(venueRows);
      setHosted(tournamentRows.hosted);
      setJoined(tournamentRows.joined);
    });
  }, [run, user]);

  const refreshSnapshot = useCallback(async (id?: string) => {
    const tournamentId = id ?? tournament?.id;
    if (!tournamentId) return;
    const next = await getTournament(tournamentId, true);
    setTournament(next);
    setSetup(settingsFromTournament(next));
  }, [tournament?.id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void refreshSnapshot();
    }, 500);
  }, [refreshSnapshot]);

  useEffect(() => {
    getTournamentGuestToken();
    setSavedTournamentId(storageGetActiveTournament());
  }, []);

  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      void run("preview", () => previewTournamentInvite(initialToken), setPreview);
    }
  }, [initialToken, run]);

  useEffect(() => {
    if (!user) return;
    void loadHostDashboard();
  }, [loadHostDashboard, user]);

  useEffect(() => {
    if (!user) return;
    void run("saved-decks", listSavedDecks, setSavedDecks);
  }, [run, user]);

  useEffect(() => {
    if (!invite?.url) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    void import("qrcode").then(async (QRCode) => {
      const dataUrl = await QRCode.toDataURL(invite.url ?? "", {
        margin: 1,
        width: 220,
        color: { dark: "#f8fafc", light: "#020617" },
      });
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [invite?.url]);

  useEffect(() => {
    if (!tournament?.id) return;
    const supabase = createBrowserSupabaseClient();
    let channel: RealtimeChannel | null = supabase.channel(`tournament-web-${tournament.id}`);
    for (const entry of REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: entry.table,
          filter: `${entry.filterColumn}=eq.${tournament.id}`,
        },
        scheduleRefresh,
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setRealtimeState("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("fallback");
    });
    const poll = window.setInterval(() => {
      void refreshSnapshot(tournament.id);
    }, 30000);
    return () => {
      window.clearInterval(poll);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refreshSnapshot, scheduleRefresh, tournament?.id]);

  useEffect(() => {
    if (!tournament) return;
    if (!manualPairings.length) setManualPairings(buildDefaultManualPairings(tournament));
    if (!manualPods.length) setManualPods(buildDefaultManualPods(tournament));
    setWinnerParticipantId(tournament.overallWinnerParticipantId ?? "");
  }, [manualPairings.length, manualPods.length, tournament]);

  useEffect(() => {
    if (!currentPods.length) return;
    setReseatDraft((previous) => {
      const next = { ...previous };
      for (const entry of tournament?.podEntries ?? []) {
        if (!next[entry.participantId]) next[entry.participantId] = entry.podId;
      }
      return next;
    });
  }, [currentPods.length, tournament?.podEntries]);

  async function handleCreateTournament(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setNotice({ type: "error", message: "Sign in to host tournaments. Players can still join as guests." });
      return;
    }
    await run("create", () => createTournament(setup), ({ tournament: next, invite: freshInvite }) => {
      setTournament(next);
      setInvite(freshInvite);
      setRole("host");
      setWorkspaceTab("rounds");
      setNotice({ type: "success", message: "Tournament lobby created." });
      storageSetActiveTournament(next.id);
      void loadHostDashboard();
    });
  }

  async function handleUpdateSetup() {
    if (!tournament) return;
    await run("update-setup", () => updateTournament(tournament.id, setup), (next) => {
      setTournament(next);
      setNotice({ type: "success", message: "Setup updated." });
    });
  }

  async function handleSaveVenue(event: FormEvent) {
    event.preventDefault();
    await run("save-venue", () => saveTournamentVenue(venueDraft), (venue) => {
      setVenues((rows) => [venue, ...rows.filter((row) => row.id !== venue.id)]);
      setVenueDraft({ name: "", location: "" });
      setSetup((currentSetup) => ({ ...currentSetup, venueId: venue.id }));
      setNotice({ type: "success", message: "Venue saved." });
    });
  }

  async function handlePreviewInvite(event: FormEvent) {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setNotice({ type: "error", message: "Paste an invite link or token first." });
      return;
    }
    await run("preview", () => previewTournamentInvite(token), (next) => {
      setPreview(next);
      setNotice({ type: "success", message: "Invite found." });
    });
  }

  function joinDeckSubmission() {
    if (deckMode === "saved" && selectedSavedDeckId) {
      const deck = savedDecks.find((row) => row.id === selectedSavedDeckId);
      return { deckId: selectedSavedDeckId, deckName: deck?.title ?? deck?.name ?? (deckName || null) };
    }
    if ((deckMode === "pasted" || deckMode === "import") && deckText.trim()) {
      return {
        deckId: null,
        deckName: deckName.trim() || "Submitted Deck",
        decklistText: deckText,
        deckCards,
      };
    }
    return { deckId: null, deckName: null, decklistText: null, deckCards: [] };
  }

  async function handleJoinTournament(event: FormEvent) {
    event.preventDefault();
    if (!tokenInput.trim()) {
      setNotice({ type: "error", message: "Paste an invite link or token first." });
      return;
    }
    if (!displayName.trim()) {
      setNotice({ type: "error", message: "Add your player name." });
      return;
    }
    if (deckRequirement === "required" && deckMode === "none") {
      setNotice({ type: "error", message: "This event requires a decklist before joining." });
      return;
    }
    await run("join", () => joinTournament({
      inviteUrl: tokenInput,
      displayName,
      art,
      ...joinDeckSubmission(),
    }), (next) => {
      setTournament(next);
      setRole("player");
      setWorkspaceTab("rounds");
      setNotice({ type: "success", message: "Joined tournament." });
      storageSetActiveTournament(next.id);
    });
  }

  async function handleImportDeckUrl() {
    if (!deckImportUrl.trim()) {
      setNotice({ type: "error", message: "Paste a public Moxfield or Archidekt URL first." });
      return;
    }
    await run("import-deck", () => importDeckUrl(deckImportUrl), (imported) => {
      setDeckMode("import");
      setDeckName(imported.title);
      setDeckText(imported.deckText);
      setNotice({ type: "success", message: `Imported ${imported.title}.` });
    });
  }

  async function handleSearchArt() {
    const query = artQuery.trim();
    if (query.length < 2) return;
    await run("art-search", async () => {
      // eslint-disable-next-line no-restricted-globals -- Same-origin card search endpoint needs direct response handling here.
      const searchRes = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const searchJson = (await searchRes.json().catch(() => ({}))) as { cards?: Array<{ name: string }> };
      const names = (searchJson.cards ?? []).map((card) => card.name).slice(0, 8);
      if (!names.length) return [];
      // eslint-disable-next-line no-restricted-globals -- Same-origin image lookup returns a loose Scryfall-compatible payload.
      const imageRes = await fetch("/api/cards/batch-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const imageJson = (await imageRes.json().catch(() => ({}))) as { data?: Array<{ name: string; image_uris?: { small?: string; normal?: string; art_crop?: string } }> };
      const imageByName = new Map((imageJson.data ?? []).map((row) => [row.name, row.image_uris]));
      return names.map((name) => {
        const image = imageByName.get(name);
        return { name, imageUrl: image?.art_crop ?? image?.small, normalUrl: image?.normal ?? image?.small };
      });
    }, setArtResults);
  }

  async function handleOpenTournament(id: string, nextRole: Role) {
    await run("open", () => getTournament(id, true), (next) => {
      setTournament(next);
      setSetup(settingsFromTournament(next));
      setRole(nextRole);
      setWorkspaceTab("rounds");
      storageSetActiveTournament(next.id);
    });
  }

  async function handleRefreshInvite() {
    if (!tournament) return;
    await run("invite", () => refreshTournamentInvite(tournament.id), (freshInvite) => {
      setInvite(freshInvite);
      setNotice({ type: "success", message: "Fresh invite generated." });
    });
  }

  async function handleStart() {
    if (!tournament) return;
    const body = setup.pairingMode === "manual" || tournament.mode === "commander_pods"
      ? normalizeManualBody(tournament, manualPairings, manualPods, allowRematches)
      : {};
    await run("start", () => startTournament(tournament.id, body), (next) => {
      setTournament(next);
      setWorkspaceTab("rounds");
      setNotice({ type: "success", message: "Tournament started." });
    });
  }

  async function handleAdvance() {
    if (!tournament) return;
    const body = setup.pairingMode === "manual" || tournament.mode === "commander_pods"
      ? normalizeManualBody(tournament, manualPairings, manualPods, allowRematches)
      : {};
    await run("advance", () => advanceTournament(tournament.id, body), (next) => {
      setTournament(next);
      setNotice({ type: "success", message: "Next round created." });
    });
  }

  async function handleSubmitResult(match: TournamentMatch, override = false) {
    if (!tournament) return;
    const draft = resultDrafts[match.id] ?? defaultResultDraft(match);
    const payload = {
      matchId: match.id,
      result: draft.result,
      playerAGameWins: Number(draft.playerAGameWins),
      playerBGameWins: Number(draft.playerBGameWins),
      draws: Number(draft.draws),
    };
    const action = override
      ? () => overrideMatchResult(tournament.id, match.id, { ...payload, note: draft.note })
      : () => reportMatchResult(tournament.id, match.roundId, payload);
    await run(override ? "override-result" : "report-result", action, setTournament);
  }

  async function handleDeckUpdate(event: FormEvent) {
    event.preventDefault();
    if (!tournament) return;
    const participantId = tournament.isHost ? hostDeckParticipantId || undefined : undefined;
    await run("deck-update", () => updateTournamentDeck(tournament.id, { ...joinDeckSubmission(), participantId }), (next) => {
      setTournament(next);
      setNotice({ type: "success", message: "Deck submission saved." });
    });
  }

  async function handleReseatPods() {
    if (!tournament || !current) return;
    const assignments = tournament.podEntries
      .filter((entry) => entry.roundId === current.id)
      .map((entry) => ({ participantId: entry.participantId, podId: reseatDraft[entry.participantId] ?? entry.podId }));
    await run("reseat", () => reseatTournamentPods(tournament.id, current.id, assignments), (next) => {
      setTournament(next);
      setNotice({ type: "success", message: "Pod seating saved." });
    });
  }

  const roleContent = tournament ? (
    <TournamentWorkspace
      role={role}
      tournament={tournament}
      current={current}
      currentMatches={currentMatches}
      currentPods={currentPods}
      activePlayers={activePlayers}
      workspaceTab={workspaceTab}
      setWorkspaceTab={setWorkspaceTab}
      realtimeState={realtimeState}
      invite={invite}
      qrDataUrl={qrDataUrl}
      setup={setup}
      setSetup={setSetup}
      venues={venues}
      busy={busy}
      isDev={isDev}
      resultDrafts={resultDrafts}
      setResultDrafts={setResultDrafts}
      podWinners={podWinners}
      setPodWinners={setPodWinners}
      manualPairings={manualPairings}
      setManualPairings={setManualPairings}
      manualPods={manualPods}
      setManualPods={setManualPods}
      allowRematches={allowRematches}
      setAllowRematches={setAllowRematches}
      winnerParticipantId={winnerParticipantId}
      setWinnerParticipantId={setWinnerParticipantId}
      issueText={issueText}
      setIssueText={setIssueText}
      deckMode={deckMode}
      setDeckMode={setDeckMode}
      deckName={deckName}
      setDeckName={setDeckName}
      deckText={deckText}
      setDeckText={setDeckText}
      deckCards={deckCards}
      savedDecks={savedDecks}
      selectedSavedDeckId={selectedSavedDeckId}
      setSelectedSavedDeckId={setSelectedSavedDeckId}
      deckImportUrl={deckImportUrl}
      setDeckImportUrl={setDeckImportUrl}
      hostDeckParticipantId={hostDeckParticipantId}
      setHostDeckParticipantId={setHostDeckParticipantId}
      reseatDraft={reseatDraft}
      setReseatDraft={setReseatDraft}
      onRefresh={() => void run("refresh", () => getTournament(tournament.id, true), setTournament)}
      onRefreshInvite={handleRefreshInvite}
      onUpdateSetup={handleUpdateSetup}
      onStart={handleStart}
      onAdvance={handleAdvance}
      onEnd={() => void run("end", () => endTournament(tournament.id), setTournament)}
      onWinner={() => winnerParticipantId && void run("winner", () => declareTournamentWinner(tournament.id, winnerParticipantId), setTournament)}
      onAddTestPlayers={(count) => void run("test-players", () => addTestParticipants(tournament.id, count), setTournament)}
      onDelete={() => void run("delete", async () => { await deleteTournament(tournament.id); return null; }, () => {
        setTournament(null);
        setRole("host");
        void loadHostDashboard();
      })}
      onDrop={(participantId, reason) => void run("drop", () => dropTournamentParticipant(tournament.id, participantId, reason), setTournament)}
      onIssue={() => issueText.trim() && void run("issue", () => reportTournamentIssue(tournament.id, issueText), (next) => {
        setTournament(next);
        setIssueText("");
      })}
      onSubmitResult={handleSubmitResult}
      onConfirmMatch={(match, action) => void run("confirm-match", () => confirmMatchResult(tournament.id, match.roundId, match.id, action), setTournament)}
      onPodResult={(podId, winnerId) => void run("pod-result", () => reportPodResult(tournament.id, podId, winnerId), setTournament)}
      onPodConfirm={(podId, action) => void run("pod-confirm", () => confirmPodResult(tournament.id, podId, action), setTournament)}
      onDeckUpdate={handleDeckUpdate}
      onImportDeck={handleImportDeckUrl}
      onReseatPods={handleReseatPods}
    />
  ) : role === "host" ? (
    <HostPanel
      userReady={Boolean(user)}
      authLoading={authLoading}
      setup={setup}
      setSetup={setSetup}
      venues={venues}
      hosted={hosted}
      joined={joined}
      venueDraft={venueDraft}
      setVenueDraft={setVenueDraft}
      busy={busy}
      onCreate={handleCreateTournament}
      onSaveVenue={handleSaveVenue}
      onDeleteVenue={(id) => void run("delete-venue", async () => { await deleteTournamentVenue(id); return id; }, (deletedId) => {
        setVenues((rows) => rows.filter((row) => row.id !== deletedId));
        if (setup.venueId === deletedId) setSetup((currentSetup) => ({ ...currentSetup, venueId: null }));
      })}
      onOpen={(id) => void handleOpenTournament(id, "host")}
      onBack={() => setRole("landing")}
    />
  ) : role === "player" ? (
    <PlayerJoinPanel
      tokenInput={tokenInput}
      setTokenInput={setTokenInput}
      preview={preview}
      displayName={displayName}
      setDisplayName={setDisplayName}
      art={art}
      setArt={setArt}
      artQuery={artQuery}
      setArtQuery={setArtQuery}
      artResults={artResults}
      deckMode={deckMode}
      setDeckMode={setDeckMode}
      deckName={deckName}
      setDeckName={setDeckName}
      deckText={deckText}
      setDeckText={setDeckText}
      deckCards={deckCards}
      deckImportUrl={deckImportUrl}
      setDeckImportUrl={setDeckImportUrl}
      selectedSavedDeckId={selectedSavedDeckId}
      setSelectedSavedDeckId={setSelectedSavedDeckId}
      savedDecks={savedDecks}
      userReady={Boolean(user)}
      busy={busy}
      appInviteUrl={appInviteUrl}
      onPreview={handlePreviewInvite}
      onJoin={handleJoinTournament}
      onSearchArt={handleSearchArt}
      onImportDeck={handleImportDeckUrl}
      onBack={() => setRole("landing")}
    />
  ) : (
    <Landing
      savedTournamentId={savedTournamentId}
      hosted={hosted}
      joined={joined}
      userReady={Boolean(user)}
      authLoading={authLoading}
      onChoose={setRole}
      onResume={(id) => void handleOpenTournament(id, user ? "host" : "player")}
    />
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(10,10,14,0.98),rgba(2,6,23,0.96))] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
      <header className="border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">ManaTap tools</p>
            <h1 className="mt-1 text-3xl font-black leading-tight text-white sm:text-4xl">Tournament Manager</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-300">
              Host events, join by invite, submit decklists, report results, and keep standings moving from any browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-300">
            <StatusPill tone={realtimeState === "live" ? "green" : "neutral"}>
              {realtimeState === "live" ? "Realtime live" : "Refresh fallback"}
            </StatusPill>
            <StatusPill tone={user ? "cyan" : "amber"}>{user ? "Signed in" : "Guest player ready"}</StatusPill>
          </div>
        </div>
        {notice ? <NoticeBanner notice={notice} onClose={() => setNotice(null)} /> : null}
      </header>
      {roleContent}
    </div>
  );
}

function Landing({
  savedTournamentId,
  hosted,
  joined,
  userReady,
  authLoading,
  onChoose,
  onResume,
}: {
  savedTournamentId: string;
  hosted: TournamentListRow[];
  joined: TournamentListRow[];
  userReady: boolean;
  authLoading: boolean;
  onChoose: (role: Role) => void;
  onResume: (id: string) => void;
}) {
  const activeHosted = hosted.filter((row) => row.status !== "completed" && row.status !== "cancelled").slice(0, 4);
  const activeJoined = joined.filter((row) => row.status !== "completed" && row.status !== "cancelled").slice(0, 4);
  return (
    <section className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1fr]">
      <button
        type="button"
        onClick={() => onChoose("host")}
        className="group min-h-[260px] rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:-translate-y-0.5 hover:border-amber-200/60 hover:bg-amber-300/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-amber-200">
          <Trophy size={22} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-2xl font-black text-white">Host a tournament</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-300">Create a lobby, show a QR code, pick formats and structures, then run rounds and standings.</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-amber-200">
          Start hosting <ArrowRight size={16} aria-hidden="true" />
        </div>
        {!userReady && !authLoading ? (
          <p className="mt-4 rounded-md border border-amber-300/20 bg-black/30 px-3 py-2 text-xs leading-5 text-amber-100/85">
            Hosting requires sign-in. Players can still join as guests.
          </p>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onChoose("player")}
        className="group min-h-[260px] rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200/60 hover:bg-cyan-300/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
          <UserPlus size={22} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-2xl font-black text-white">Join as a player</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-300">Paste an invite link or token, pick your player name and art, submit your deck, and report results.</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-cyan-200">
          Join event <ArrowRight size={16} aria-hidden="true" />
        </div>
        <p className="mt-4 rounded-md border border-cyan-300/20 bg-black/30 px-3 py-2 text-xs leading-5 text-cyan-100/85">
          No account required for player join or result reporting.
        </p>
      </button>

      {(savedTournamentId || activeHosted.length || activeJoined.length) ? (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-neutral-300">Recent tournament</h3>
            {savedTournamentId ? (
              <Button tone="neutral" size="sm" onClick={() => onResume(savedTournamentId)}>
                <RefreshCw size={14} aria-hidden="true" /> Resume saved
              </Button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[...activeHosted, ...activeJoined].slice(0, 6).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onResume(row.id)}
                className="rounded-md border border-white/10 bg-neutral-950/70 px-3 py-3 text-left transition hover:border-amber-300/35 hover:bg-amber-300/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-bold text-white">{row.title}</span>
                  <StatusPill tone={row.status === "active" ? "green" : "neutral"}>{row.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-neutral-400">{modeLabel(row.mode)} - round {row.current_round || 0}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HostPanel({
  userReady,
  authLoading,
  setup,
  setSetup,
  venues,
  hosted,
  joined,
  venueDraft,
  setVenueDraft,
  busy,
  onCreate,
  onSaveVenue,
  onDeleteVenue,
  onOpen,
  onBack,
}: {
  userReady: boolean;
  authLoading: boolean;
  setup: CreateTournamentInput;
  setSetup: (value: CreateTournamentInput | ((current: CreateTournamentInput) => CreateTournamentInput)) => void;
  venues: TournamentVenue[];
  hosted: TournamentListRow[];
  joined: TournamentListRow[];
  venueDraft: { name: string; location: string };
  setVenueDraft: (value: { name: string; location: string }) => void;
  busy: string | null;
  onCreate: (event: FormEvent) => void;
  onSaveVenue: (event: FormEvent) => void;
  onDeleteVenue: (id: string) => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={onCreate} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Host setup</h2>
            <p className="mt-1 text-sm text-neutral-400">Sign in, set the event rules, then create a lobby.</p>
          </div>
          <Button type="button" tone="neutral" onClick={onBack}>Back</Button>
        </div>

        {!userReady && !authLoading ? (
          <Callout tone="amber" icon={<ShieldCheck size={17} />}>
            Hosting needs a ManaTap account. Use the site header to sign in or create one, then come back here.
          </Callout>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Tournament name">
            <input
              value={setup.title}
              onChange={(event) => setSetup((current) => ({ ...current, title: event.target.value }))}
              placeholder="Friday Commander League"
              className={CONTROL_CLASS}
              required
              minLength={2}
              maxLength={140}
            />
          </Field>
          <Field label="Venue">
            <select
              value={setup.venueId ?? ""}
              onChange={(event) => setSetup((current) => ({ ...current, venueId: event.target.value || null }))}
              className={CONTROL_CLASS}
            >
              <option value="">No venue</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select value={setup.format} onChange={(event) => setSetup((current) => ({ ...current, format: event.target.value as TournamentFormat }))} className={CONTROL_CLASS}>
              {FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </Field>
          <Field label="Structure">
            <select value={setup.mode} onChange={(event) => setSetup((current) => ({ ...current, mode: event.target.value as TournamentMode }))} className={CONTROL_CLASS}>
              {MODE_OPTIONS.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-neutral-500">{MODE_OPTIONS.find((mode) => mode.value === setup.mode)?.help}</p>
          </Field>
          <Field label="Player cap">
            <NumberInput min={2} max={128} value={setup.playerCap} onChange={(value) => setSetup((current) => ({ ...current, playerCap: value }))} />
          </Field>
          <Field label={setup.mode === "commander_pods" ? "Pod rounds" : "Swiss rounds"}>
            <NumberInput min={1} max={12} value={setup.mode === "commander_pods" ? setup.podRounds : setup.swissRounds} onChange={(value) => setSetup((current) => setup.mode === "commander_pods" ? { ...current, podRounds: value } : { ...current, swissRounds: value })} />
          </Field>
          <Field label="Top cut">
            <select value={setup.topCut} onChange={(event) => setSetup((current) => ({ ...current, topCut: event.target.value as TopCut }))} className={CONTROL_CLASS} disabled={setup.mode !== "swiss"}>
              {TOP_CUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Pairings">
            <select value={setup.pairingMode} onChange={(event) => setSetup((current) => ({ ...current, pairingMode: event.target.value as PairingMode }))} className={CONTROL_CLASS}>
              <option value="auto">Automatic</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <Field label="Deck submission">
            <select
              value={setup.deckSubmissionMode}
              onChange={(event) => {
                const mode = event.target.value as DeckSubmissionMode;
                setSetup((current) => ({ ...current, deckSubmissionMode: mode, decklistsEnabled: mode !== "off" }));
              }}
              className={CONTROL_CLASS}
            >
              {DECK_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
          </Field>
          <Field label="Deck visibility">
            <select value={setup.deckVisibility} onChange={(event) => setSetup((current) => ({ ...current, deckVisibility: event.target.value as DeckVisibility }))} className={CONTROL_CLASS}>
              <option value="host_only">Host only</option>
              <option value="players">Players can view</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            checked={setup.roundRobinDrawsEnabled}
            onChange={(checked) => setSetup((current) => ({ ...current, roundRobinDrawsEnabled: checked }))}
            label="Allow round-robin draws"
          />
          <Toggle
            checked={setup.deckLegalityCheckEnabled}
            onChange={(checked) => setSetup((current) => ({ ...current, deckLegalityCheckEnabled: checked }))}
            label="Basic deck legality check"
          />
        </div>

        <Button type="submit" tone="amber" disabled={!userReady || busy !== null}>
          {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create lobby
        </Button>
      </form>

      <aside className="space-y-4">
        <form onSubmit={onSaveVenue} className="rounded-lg border border-white/10 bg-black/30 p-4">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Venues</h3>
          <div className="mt-3 space-y-2">
            <input value={venueDraft.name} onChange={(event) => setVenueDraft({ ...venueDraft, name: event.target.value })} placeholder="Store or venue name" className={CONTROL_CLASS} />
            <input value={venueDraft.location} onChange={(event) => setVenueDraft({ ...venueDraft, location: event.target.value })} placeholder="Location optional" className={CONTROL_CLASS} />
            <Button type="submit" tone="neutral" size="sm" disabled={!userReady || !venueDraft.name.trim() || busy !== null}>
              <Save size={14} /> Save venue
            </Button>
          </div>
          {venues.length ? (
            <div className="mt-3 space-y-2">
              {venues.slice(0, 5).map((venue) => (
                <div key={venue.id} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-neutral-950/70 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{venue.name}</div>
                    <div className="truncate text-xs text-neutral-500">{venue.location || "No location"}</div>
                  </div>
                  <button type="button" onClick={() => onDeleteVenue(venue.id)} className="rounded p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-200" aria-label={`Delete ${venue.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </form>

        <RecentTournamentList title="Hosted" rows={hosted} empty="No hosted tournaments yet." onOpen={onOpen} />
        <RecentTournamentList title="Joined" rows={joined} empty="No joined tournaments yet." onOpen={onOpen} />
      </aside>
    </section>
  );
}

function PlayerJoinPanel(props: {
  tokenInput: string;
  setTokenInput: (value: string) => void;
  preview: TournamentPreview | null;
  displayName: string;
  setDisplayName: (value: string) => void;
  art: PlayerArt;
  setArt: (value: PlayerArt) => void;
  artQuery: string;
  setArtQuery: (value: string) => void;
  artResults: ArtSearchResult[];
  deckMode: DeckInputMode;
  setDeckMode: (value: DeckInputMode) => void;
  deckName: string;
  setDeckName: (value: string) => void;
  deckText: string;
  setDeckText: (value: string) => void;
  deckCards: TournamentDeckCard[];
  deckImportUrl: string;
  setDeckImportUrl: (value: string) => void;
  selectedSavedDeckId: string;
  setSelectedSavedDeckId: (value: string) => void;
  savedDecks: SavedDeckSummary[];
  userReady: boolean;
  busy: string | null;
  appInviteUrl: string;
  onPreview: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
  onSearchArt: () => void;
  onImportDeck: () => void;
  onBack: () => void;
}) {
  const deckRequired = ((props.preview?.settings.deckSubmissionMode as DeckSubmissionMode | undefined) ?? "optional") === "required";
  return (
    <section className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={props.onPreview} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Player join</h2>
            <p className="mt-1 text-sm text-neutral-400">Paste the link or token from the host QR code.</p>
          </div>
          <Button type="button" tone="neutral" onClick={props.onBack}>Back</Button>
        </div>
        <Field label="Invite link or token">
          <div className="flex gap-2">
            <input value={props.tokenInput} onChange={(event) => props.setTokenInput(event.target.value)} placeholder="https://www.manatap.ai/app/tournament?tournamentToken=..." className={CONTROL_CLASS} />
            <Button type="submit" tone="cyan" disabled={props.busy !== null}>
              {props.busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Preview
            </Button>
          </div>
        </Field>
        {props.preview ? (
          <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">{props.preview.title}</h3>
                <p className="mt-1 text-sm text-neutral-300">{props.preview.format} - {modeLabel(props.preview.mode)}</p>
              </div>
              <StatusPill tone={props.preview.status === "registration" ? "green" : "neutral"}>{props.preview.status}</StatusPill>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
              <Metric label="Players" value={`${props.preview.participantCount}/${Number(props.preview.settings.playerCap ?? 32)}`} />
              <Metric label="Decklists" value={deckModeLabel(props.preview.settings.deckSubmissionMode as DeckSubmissionMode)} />
              <Metric label="Venue" value={props.preview.venue?.name ?? "No venue"} />
              <Metric label="Pairings" value={String(props.preview.settings.pairingMode ?? "auto")} />
            </div>
          </div>
        ) : null}
        <a href={props.appInviteUrl} className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-amber-200">
          <Link2 size={14} /> Open this invite in the ManaTap app
        </a>
      </form>

      <form onSubmit={props.onJoin} className="space-y-4 rounded-lg border border-white/10 bg-black/25 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Player name">
            <input value={props.displayName} onChange={(event) => props.setDisplayName(event.target.value)} placeholder="Your name" className={CONTROL_CLASS} required maxLength={80} />
          </Field>
          <Field label="Player art">
            <div className="flex flex-wrap gap-2">
              {ART_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => props.setArt({ source: "color", colorHex: color, title: "Player color" })}
                  className={cn("h-9 w-9 rounded-full border-2", props.art.colorHex === color ? "border-white" : "border-white/20")}
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-950/60 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={props.artQuery} onChange={(event) => props.setArtQuery(event.target.value)} placeholder="Search a card for player art" className={CONTROL_CLASS} />
            <Button type="button" tone="neutral" onClick={props.onSearchArt} disabled={props.busy !== null}>
              <Palette size={15} /> Search art
            </Button>
          </div>
          {props.artResults.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {props.artResults.map((result) => (
                <button
                  key={result.name}
                  type="button"
                  onClick={() => props.setArt({ source: "scryfall", imageUrl: result.imageUrl ?? result.normalUrl, title: result.name })}
                  className="overflow-hidden rounded-md border border-white/10 bg-black/40 text-left transition hover:border-cyan-300/50"
                >
                  {result.imageUrl ? <img src={result.imageUrl} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-neutral-900" />}
                  <div className="truncate px-2 py-1.5 text-xs font-semibold text-neutral-200">{result.name}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <DeckSubmissionPanel
          deckRequired={deckRequired}
          deckMode={props.deckMode}
          setDeckMode={props.setDeckMode}
          deckName={props.deckName}
          setDeckName={props.setDeckName}
          deckText={props.deckText}
          setDeckText={props.setDeckText}
          deckCards={props.deckCards}
          deckImportUrl={props.deckImportUrl}
          setDeckImportUrl={props.setDeckImportUrl}
          selectedSavedDeckId={props.selectedSavedDeckId}
          setSelectedSavedDeckId={props.setSelectedSavedDeckId}
          savedDecks={props.savedDecks}
          userReady={props.userReady}
          busy={props.busy}
          onImportDeck={props.onImportDeck}
        />

        <Button type="submit" tone="cyan" disabled={props.busy !== null || !props.preview}>
          {props.busy === "join" ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Join tournament
        </Button>
      </form>
    </section>
  );
}

function TournamentWorkspace(props: {
  role: Role;
  tournament: TournamentSnapshot;
  current: TournamentRound | null;
  currentMatches: TournamentMatch[];
  currentPods: TournamentPod[];
  activePlayers: TournamentParticipant[];
  workspaceTab: WorkspaceTab;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  realtimeState: "idle" | "live" | "fallback";
  invite: TournamentInvite | null;
  qrDataUrl: string;
  setup: CreateTournamentInput;
  setSetup: (value: CreateTournamentInput | ((current: CreateTournamentInput) => CreateTournamentInput)) => void;
  venues: TournamentVenue[];
  busy: string | null;
  isDev: boolean;
  resultDrafts: Record<string, ResultDraft>;
  setResultDrafts: (value: Record<string, ResultDraft> | ((current: Record<string, ResultDraft>) => Record<string, ResultDraft>)) => void;
  podWinners: Record<string, string>;
  setPodWinners: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  manualPairings: ManualPairing[];
  setManualPairings: (value: ManualPairing[] | ((current: ManualPairing[]) => ManualPairing[])) => void;
  manualPods: ManualPod[];
  setManualPods: (value: ManualPod[] | ((current: ManualPod[]) => ManualPod[])) => void;
  allowRematches: boolean;
  setAllowRematches: (value: boolean) => void;
  winnerParticipantId: string;
  setWinnerParticipantId: (value: string) => void;
  issueText: string;
  setIssueText: (value: string) => void;
  deckMode: DeckInputMode;
  setDeckMode: (value: DeckInputMode) => void;
  deckName: string;
  setDeckName: (value: string) => void;
  deckText: string;
  setDeckText: (value: string) => void;
  deckCards: TournamentDeckCard[];
  savedDecks: SavedDeckSummary[];
  selectedSavedDeckId: string;
  setSelectedSavedDeckId: (value: string) => void;
  deckImportUrl: string;
  setDeckImportUrl: (value: string) => void;
  hostDeckParticipantId: string;
  setHostDeckParticipantId: (value: string) => void;
  reseatDraft: Record<string, string>;
  setReseatDraft: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  onRefresh: () => void;
  onRefreshInvite: () => void;
  onUpdateSetup: () => void;
  onStart: () => void;
  onAdvance: () => void;
  onEnd: () => void;
  onWinner: () => void;
  onAddTestPlayers: (count: number) => void;
  onDelete: () => void;
  onDrop: (participantId?: string, reason?: "leave" | "kick") => void;
  onIssue: () => void;
  onSubmitResult: (match: TournamentMatch, override?: boolean) => void;
  onConfirmMatch: (match: TournamentMatch, action: "confirm" | "dispute") => void;
  onPodResult: (podId: string, winnerId: string) => void;
  onPodConfirm: (podId: string, action: "confirm" | "dispute") => void;
  onDeckUpdate: (event: FormEvent) => void;
  onImportDeck: () => void;
  onReseatPods: () => void;
}) {
  const tournament = props.tournament;
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: ReactNode }> = [
    { id: "rounds", label: tournament.mode === "commander_pods" ? "Pods" : "Pairings", icon: <Swords size={15} /> },
    { id: "players", label: "Players", icon: <Users size={15} /> },
    { id: "standings", label: "Standings", icon: <Medal size={15} /> },
    { id: "activity", label: "Activity", icon: <Activity size={15} /> },
    { id: "settings", label: "Settings", icon: <Settings size={15} /> },
  ];
  const missingRequiredDecks = tournament.settings.deckSubmissionMode === "required"
    ? props.activePlayers.filter((participant) => !participant.deckSubmitted).length
    : 0;
  const unresolved = tournament.matches.filter((match) => ["pending", "reported", "disputed"].includes(match.status)).length
    + tournament.pods.filter((pod) => ["pending", "reported", "disputed"].includes(pod.status)).length;

  return (
    <section className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-b border-white/10 bg-black/25 p-4 xl:border-b-0 xl:border-r">
        <div className="rounded-lg border border-white/10 bg-neutral-950/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-white">{tournament.title}</h2>
              <p className="mt-1 text-sm text-neutral-400">{tournament.format} - {modeLabel(tournament.mode)}</p>
            </div>
            <StatusPill tone={tournament.status === "active" ? "green" : tournament.status === "registration" ? "amber" : "neutral"}>{tournament.status}</StatusPill>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Players" value={`${props.activePlayers.length}/${Number(tournament.settings.playerCap ?? 32)}`} />
            <Metric label="Round" value={tournament.currentRound ? String(tournament.currentRound) : "-"} />
            <Metric label="Decklists" value={deckModeLabel(tournament.settings.deckSubmissionMode as DeckSubmissionMode)} />
            <Metric label="Open items" value={String(unresolved)} />
          </div>
          {missingRequiredDecks ? (
            <Callout tone="amber" icon={<AlertTriangle size={16} />}>
              {missingRequiredDecks} active player{missingRequiredDecks === 1 ? "" : "s"} still need a decklist.
            </Callout>
          ) : null}
          {tournament.overallWinnerParticipantId ? (
            <Callout tone="green" icon={<Crown size={16} />}>
              Winner: {participantName(tournament, tournament.overallWinnerParticipantId)}
            </Callout>
          ) : null}
        </div>

        {tournament.isHost ? (
          <HostControls
            tournament={tournament}
            invite={props.invite}
            qrDataUrl={props.qrDataUrl}
            busy={props.busy}
            isDev={props.isDev}
            winnerParticipantId={props.winnerParticipantId}
            setWinnerParticipantId={props.setWinnerParticipantId}
            onRefresh={props.onRefresh}
            onRefreshInvite={props.onRefreshInvite}
            onStart={props.onStart}
            onAdvance={props.onAdvance}
            onEnd={props.onEnd}
            onWinner={props.onWinner}
            onAddTestPlayers={props.onAddTestPlayers}
            onDelete={props.onDelete}
          />
        ) : (
          <PlayerControls
            tournament={tournament}
            issueText={props.issueText}
            setIssueText={props.setIssueText}
            busy={props.busy}
            onRefresh={props.onRefresh}
            onIssue={props.onIssue}
            onLeave={() => props.onDrop(undefined, "leave")}
          />
        )}
      </aside>

      <div className="min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.setWorkspaceTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition",
                props.workspaceTab === tab.id
                  ? "border-amber-300/55 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-black/30 text-neutral-300 hover:border-white/25 hover:text-white",
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {props.workspaceTab === "rounds" ? (
          <RoundsPanel
            tournament={tournament}
            current={props.current}
            currentMatches={props.currentMatches}
            currentPods={props.currentPods}
            resultDrafts={props.resultDrafts}
            setResultDrafts={props.setResultDrafts}
            podWinners={props.podWinners}
            setPodWinners={props.setPodWinners}
            reseatDraft={props.reseatDraft}
            setReseatDraft={props.setReseatDraft}
            manualPairings={props.manualPairings}
            setManualPairings={props.setManualPairings}
            manualPods={props.manualPods}
            setManualPods={props.setManualPods}
            allowRematches={props.allowRematches}
            setAllowRematches={props.setAllowRematches}
            busy={props.busy}
            onSubmitResult={props.onSubmitResult}
            onConfirmMatch={props.onConfirmMatch}
            onPodResult={props.onPodResult}
            onPodConfirm={props.onPodConfirm}
            onReseatPods={props.onReseatPods}
          />
        ) : props.workspaceTab === "players" ? (
          <PlayersPanel tournament={tournament} busy={props.busy} onDrop={props.onDrop} />
        ) : props.workspaceTab === "standings" ? (
          <StandingsPanel tournament={tournament} />
        ) : props.workspaceTab === "activity" ? (
          <ActivityPanel tournament={tournament} />
        ) : (
          <SettingsPanel
            tournament={tournament}
            setup={props.setup}
            setSetup={props.setSetup}
            venues={props.venues}
            busy={props.busy}
            deckMode={props.deckMode}
            setDeckMode={props.setDeckMode}
            deckName={props.deckName}
            setDeckName={props.setDeckName}
            deckText={props.deckText}
            setDeckText={props.setDeckText}
            deckCards={props.deckCards}
            savedDecks={props.savedDecks}
            selectedSavedDeckId={props.selectedSavedDeckId}
            setSelectedSavedDeckId={props.setSelectedSavedDeckId}
            deckImportUrl={props.deckImportUrl}
            setDeckImportUrl={props.setDeckImportUrl}
            hostDeckParticipantId={props.hostDeckParticipantId}
            setHostDeckParticipantId={props.setHostDeckParticipantId}
            onUpdateSetup={props.onUpdateSetup}
            onDeckUpdate={props.onDeckUpdate}
            onImportDeck={props.onImportDeck}
          />
        )}
      </div>
    </section>
  );
}

function HostControls(props: {
  tournament: TournamentSnapshot;
  invite: TournamentInvite | null;
  qrDataUrl: string;
  busy: string | null;
  isDev: boolean;
  winnerParticipantId: string;
  setWinnerParticipantId: (value: string) => void;
  onRefresh: () => void;
  onRefreshInvite: () => void;
  onStart: () => void;
  onAdvance: () => void;
  onEnd: () => void;
  onWinner: () => void;
  onAddTestPlayers: (count: number) => void;
  onDelete: () => void;
}) {
  const tournament = props.tournament;
  const inviteUrl = props.invite?.url;
  return (
    <div className="mt-4 space-y-4">
      {tournament.status === "registration" ? (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-amber-100">Invite</h3>
            <Button tone="neutral" size="sm" onClick={props.onRefreshInvite} disabled={props.busy !== null}>
              <QrCode size={14} /> New QR
            </Button>
          </div>
          {props.qrDataUrl ? <img src={props.qrDataUrl} alt="Tournament invite QR code" className="mx-auto mt-3 h-44 w-44 rounded-md border border-white/10 bg-black p-2" /> : null}
          {inviteUrl ? (
            <div className="mt-3 flex gap-2">
              <input readOnly value={inviteUrl} className={cn(CONTROL_CLASS, "text-xs")} />
              <Button type="button" tone="neutral" size="sm" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>
                <Clipboard size={14} /> Copy
              </Button>
            </div>
          ) : (
            <Button tone="amber" onClick={props.onRefreshInvite} disabled={props.busy !== null}>
              <QrCode size={16} /> Generate invite QR
            </Button>
          )}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Button tone="neutral" onClick={props.onRefresh} disabled={props.busy !== null}>
          <RefreshCw size={16} /> Refresh
        </Button>
        {tournament.status === "registration" ? (
          <Button tone="green" onClick={props.onStart} disabled={props.busy !== null}>
            <Play size={16} /> Start tournament
          </Button>
        ) : null}
        {tournament.status === "active" ? (
          <>
            <Button tone="cyan" onClick={props.onAdvance} disabled={props.busy !== null}>
              <ArrowRight size={16} /> Advance round
            </Button>
            <Button tone="amber" onClick={props.onEnd} disabled={props.busy !== null}>
              <Flag size={16} /> End tournament
            </Button>
          </>
        ) : null}
      </div>

      {tournament.status === "completed" ? (
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <Field label="Overall winner">
            <select value={props.winnerParticipantId} onChange={(event) => props.setWinnerParticipantId(event.target.value)} className={CONTROL_CLASS}>
              <option value="">Pick winner</option>
              {tournament.participants.map((participant) => (
                <option key={participant.id} value={participant.id}>{participant.displayName}</option>
              ))}
            </select>
          </Field>
          <Button tone="amber" size="sm" onClick={props.onWinner} disabled={!props.winnerParticipantId || props.busy !== null}>
            <Crown size={14} /> Save winner
          </Button>
        </div>
      ) : null}

      {props.isDev && tournament.status === "registration" ? (
        <div className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-3">
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-fuchsia-100">Dev test players</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {[2, 4, 8].map((count) => (
              <Button key={count} type="button" tone="neutral" size="sm" onClick={() => props.onAddTestPlayers(count)} disabled={props.busy !== null}>
                <Wand2 size={14} /> +{count}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {tournament.status === "registration" ? (
        <Button tone="danger" onClick={props.onDelete} disabled={props.busy !== null}>
          <Trash2 size={16} /> Delete tournament
        </Button>
      ) : null}
    </div>
  );
}

function PlayerControls(props: {
  tournament: TournamentSnapshot;
  issueText: string;
  setIssueText: (value: string) => void;
  busy: string | null;
  onRefresh: () => void;
  onIssue: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <Button tone="neutral" onClick={props.onRefresh} disabled={props.busy !== null}>
        <RefreshCw size={16} /> Refresh
      </Button>
      {props.tournament.me ? (
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-300">You are playing as</h3>
          <p className="mt-1 text-lg font-black text-white">{props.tournament.me.displayName}</p>
          <p className="mt-1 text-xs text-neutral-500">{props.tournament.me.deckSubmitted ? "Deck submitted" : "No deck submitted"}</p>
        </div>
      ) : null}
      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
        <Field label="Message host">
          <textarea value={props.issueText} onChange={(event) => props.setIssueText(event.target.value)} className={cn(CONTROL_CLASS, "min-h-20")} maxLength={500} placeholder="Pairing issue, wrong result, or deck question" />
        </Field>
        <Button tone="neutral" size="sm" onClick={props.onIssue} disabled={!props.issueText.trim() || props.busy !== null}>
          <AlertTriangle size={14} /> Send issue
        </Button>
      </div>
      <Button tone="danger" onClick={props.onLeave} disabled={props.busy !== null}>
        <Ban size={16} /> Leave tournament
      </Button>
    </div>
  );
}

function RoundsPanel(props: {
  tournament: TournamentSnapshot;
  current: TournamentRound | null;
  currentMatches: TournamentMatch[];
  currentPods: TournamentPod[];
  resultDrafts: Record<string, ResultDraft>;
  setResultDrafts: (value: Record<string, ResultDraft> | ((current: Record<string, ResultDraft>) => Record<string, ResultDraft>)) => void;
  podWinners: Record<string, string>;
  setPodWinners: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  reseatDraft: Record<string, string>;
  setReseatDraft: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  manualPairings: ManualPairing[];
  setManualPairings: (value: ManualPairing[] | ((current: ManualPairing[]) => ManualPairing[])) => void;
  manualPods: ManualPod[];
  setManualPods: (value: ManualPod[] | ((current: ManualPod[]) => ManualPod[])) => void;
  allowRematches: boolean;
  setAllowRematches: (value: boolean) => void;
  busy: string | null;
  onSubmitResult: (match: TournamentMatch, override?: boolean) => void;
  onConfirmMatch: (match: TournamentMatch, action: "confirm" | "dispute") => void;
  onPodResult: (podId: string, winnerId: string) => void;
  onPodConfirm: (podId: string, action: "confirm" | "dispute") => void;
  onReseatPods: () => void;
}) {
  const tournament = props.tournament;
  const showManualBuilder = tournament.isHost && tournament.status === "registration" && ((tournament.settings.pairingMode as PairingMode) === "manual" || tournament.mode === "commander_pods");
  return (
    <div className="space-y-4">
      {showManualBuilder ? (
        <ManualRoundBuilder
          tournament={tournament}
          pairings={props.manualPairings}
          setPairings={props.setManualPairings}
          pods={props.manualPods}
          setPods={props.setManualPods}
          allowRematches={props.allowRematches}
          setAllowRematches={props.setAllowRematches}
        />
      ) : null}

      {!props.current ? (
        <EmptyState icon={<Play size={24} />} title="No active round yet" body="Host starts the tournament once enough players have joined." />
      ) : tournament.mode === "commander_pods" ? (
        <>
          <SectionHeader title={props.current.label || `Round ${props.current.roundNumber}`} subtitle={`${props.currentPods.length} pods`} />
          <div className="grid gap-3 xl:grid-cols-2">
            {props.currentPods.map((pod) => (
              <PodCard
                key={pod.id}
                tournament={tournament}
                pod={pod}
                winnerId={props.podWinners[pod.id] ?? pod.reportedWinnerParticipantId ?? pod.winnerParticipantId ?? ""}
                setWinnerId={(value) => props.setPodWinners((current) => ({ ...current, [pod.id]: value }))}
                reseatDraft={props.reseatDraft}
                setReseatDraft={props.setReseatDraft}
                busy={props.busy}
                onPodResult={props.onPodResult}
                onPodConfirm={props.onPodConfirm}
              />
            ))}
          </div>
          {tournament.isHost && props.currentPods.length ? (
            <Button tone="neutral" onClick={props.onReseatPods} disabled={props.busy !== null}>
              <Shuffle size={16} /> Save pod seating
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <SectionHeader title={props.current.label || `Round ${props.current.roundNumber}`} subtitle={`${props.currentMatches.length} matches`} />
          <div className="grid gap-3 xl:grid-cols-2">
            {props.currentMatches.map((match) => (
              <MatchCard
                key={match.id}
                tournament={tournament}
                match={match}
                draft={props.resultDrafts[match.id] ?? defaultResultDraft(match)}
                setDraft={(draft) => props.setResultDrafts((current) => ({ ...current, [match.id]: draft }))}
                busy={props.busy}
                onSubmitResult={props.onSubmitResult}
                onConfirmMatch={props.onConfirmMatch}
              />
            ))}
          </div>
        </>
      )}

      {tournament.rounds.length > 1 ? (
        <div className="rounded-lg border border-white/10 bg-black/25 p-4">
          <SectionHeader title="Round history" subtitle={`${tournament.rounds.length} rounds`} />
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {tournament.rounds.map((round) => (
              <div key={round.id} className="rounded-md border border-white/10 bg-neutral-950/70 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-white">{round.label || `Round ${round.roundNumber}`}</span>
                  <StatusPill tone={round.status === "completed" ? "green" : "neutral"}>{round.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{round.phase}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchCard(props: {
  tournament: TournamentSnapshot;
  match: TournamentMatch;
  draft: ResultDraft;
  setDraft: (draft: ResultDraft) => void;
  busy: string | null;
  onSubmitResult: (match: TournamentMatch, override?: boolean) => void;
  onConfirmMatch: (match: TournamentMatch, action: "confirm" | "dispute") => void;
}) {
  const { tournament, match, draft } = props;
  const disabled = props.busy !== null || match.status === "bye";
  const actable = canActOnMatch(match, tournament);
  const confirmable = canConfirmMatch(match, tournament);
  return (
    <article className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">Table {match.tableNumber}</div>
          <h3 className="mt-1 text-base font-black text-white">{participantName(tournament, match.playerAId)} vs {participantName(tournament, match.playerBId)}</h3>
          <p className="mt-1 text-sm text-neutral-400">{resultLabel(match, tournament)}</p>
        </div>
        <StatusPill tone={match.status === "confirmed" || match.status === "bye" ? "green" : match.status === "disputed" ? "red" : "amber"}>{match.status}</StatusPill>
      </div>
      {actable && match.status !== "bye" ? (
        <div className="mt-4 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_80px_80px_80px]">
            <select value={draft.result} onChange={(event) => props.setDraft({ ...draft, result: event.target.value as MatchResult })} className={CONTROL_CLASS}>
              <option value="a_win">{participantName(tournament, match.playerAId)} wins</option>
              <option value="b_win">{participantName(tournament, match.playerBId)} wins</option>
              <option value="draw">Draw</option>
            </select>
            <NumberInput min={0} max={9} value={draft.playerAGameWins} onChange={(value) => props.setDraft({ ...draft, playerAGameWins: value })} />
            <NumberInput min={0} max={9} value={draft.playerBGameWins} onChange={(value) => props.setDraft({ ...draft, playerBGameWins: value })} />
            <NumberInput min={0} max={9} value={draft.draws} onChange={(value) => props.setDraft({ ...draft, draws: value })} />
          </div>
          {tournament.isHost ? (
            <input value={draft.note} onChange={(event) => props.setDraft({ ...draft, note: event.target.value })} placeholder="Override note optional" className={CONTROL_CLASS} maxLength={500} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button tone="cyan" size="sm" onClick={() => props.onSubmitResult(match, false)} disabled={disabled}>
              <Check size={14} /> Report
            </Button>
            {tournament.isHost ? (
              <Button tone="amber" size="sm" onClick={() => props.onSubmitResult(match, true)} disabled={disabled}>
                <ShieldCheck size={14} /> Override
              </Button>
            ) : null}
            {confirmable ? (
              <>
                <Button tone="green" size="sm" onClick={() => props.onConfirmMatch(match, "confirm")} disabled={props.busy !== null}>
                  <Check size={14} /> Confirm
                </Button>
                <Button tone="danger" size="sm" onClick={() => props.onConfirmMatch(match, "dispute")} disabled={props.busy !== null}>
                  <X size={14} /> Dispute
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PodCard(props: {
  tournament: TournamentSnapshot;
  pod: TournamentPod;
  winnerId: string;
  setWinnerId: (value: string) => void;
  reseatDraft: Record<string, string>;
  setReseatDraft: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  busy: string | null;
  onPodResult: (podId: string, winnerId: string) => void;
  onPodConfirm: (podId: string, action: "confirm" | "dispute") => void;
}) {
  const { tournament, pod } = props;
  const entries = tournament.podEntries.filter((entry) => entry.podId === pod.id).sort((a, b) => a.seatNumber - b.seatNumber);
  const currentRoundPods = tournament.pods.filter((row) => row.roundId === pod.roundId).sort((a, b) => a.tableNumber - b.tableNumber);
  const me = tournament.me?.id;
  const isPodPlayer = Boolean(me && entries.some((entry) => entry.participantId === me));
  const canReport = tournament.isHost || isPodPlayer;
  const canConfirm = Boolean(isPodPlayer && pod.status === "reported" && pod.reportedByParticipantId !== me && pod.reportedWinnerParticipantId !== me);
  return (
    <article className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">Pod {pod.tableNumber}</div>
          <h3 className="mt-1 text-base font-black text-white">{pod.winnerParticipantId ? `${participantName(tournament, pod.winnerParticipantId)} wins` : "Waiting for pod result"}</h3>
        </div>
        <StatusPill tone={pod.status === "confirmed" ? "green" : pod.status === "disputed" ? "red" : "amber"}>{pod.status}</StatusPill>
      </div>
      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-neutral-950/70 px-3 py-2">
            <span className="text-sm font-semibold text-neutral-100">{entry.seatNumber}. {participantName(tournament, entry.participantId)}</span>
            {tournament.isHost && pod.status === "pending" ? (
              <select
                value={props.reseatDraft[entry.participantId] ?? entry.podId}
                onChange={(event) => props.setReseatDraft((current) => ({ ...current, [entry.participantId]: event.target.value }))}
                className="rounded border border-white/10 bg-black px-2 py-1 text-xs text-white"
              >
                {currentRoundPods.map((target) => <option key={target.id} value={target.id}>Pod {target.tableNumber}</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </div>
      {canReport ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select value={props.winnerId} onChange={(event) => props.setWinnerId(event.target.value)} className={CONTROL_CLASS}>
            <option value="">Pick pod winner</option>
            {entries.map((entry) => <option key={entry.participantId} value={entry.participantId}>{participantName(tournament, entry.participantId)}</option>)}
          </select>
          <Button tone={tournament.isHost ? "amber" : "cyan"} onClick={() => props.winnerId && props.onPodResult(pod.id, props.winnerId)} disabled={!props.winnerId || props.busy !== null}>
            <Trophy size={15} /> {tournament.isHost ? "Set winner" : "Report"}
          </Button>
        </div>
      ) : null}
      {canConfirm ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button tone="green" size="sm" onClick={() => props.onPodConfirm(pod.id, "confirm")} disabled={props.busy !== null}>
            <Check size={14} /> Confirm
          </Button>
          <Button tone="danger" size="sm" onClick={() => props.onPodConfirm(pod.id, "dispute")} disabled={props.busy !== null}>
            <X size={14} /> Dispute
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function ManualRoundBuilder(props: {
  tournament: TournamentSnapshot;
  pairings: ManualPairing[];
  setPairings: (value: ManualPairing[] | ((current: ManualPairing[]) => ManualPairing[])) => void;
  pods: ManualPod[];
  setPods: (value: ManualPod[] | ((current: ManualPod[]) => ManualPod[])) => void;
  allowRematches: boolean;
  setAllowRematches: (value: boolean) => void;
}) {
  const players = activeParticipants(props.tournament);
  const isPods = props.tournament.mode === "commander_pods";
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-4">
      <SectionHeader title={isPods ? "Manual pods" : "Manual pairings"} subtitle="Optional draft used when the host starts or advances." />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" tone="neutral" size="sm" onClick={() => isPods ? props.setPods(buildDefaultManualPods(props.tournament)) : props.setPairings(buildDefaultManualPairings(props.tournament))}>
          <Shuffle size={14} /> Auto draft
        </Button>
        <Toggle checked={props.allowRematches} onChange={props.setAllowRematches} label="Allow rematches" compact />
      </div>
      {isPods ? (
        <div className="mt-3 grid gap-2">
          {props.pods.map((pod, index) => (
            <div key={index} className="rounded-md border border-white/10 bg-black/25 p-3">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Pod {index + 1}</div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((slot) => (
                  <select
                    key={slot}
                    value={pod.participantIds[slot] ?? ""}
                    onChange={(event) => props.setPods((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, participantIds: Object.assign([...row.participantIds], { [slot]: event.target.value }).filter(Boolean) } : row))}
                    className={CONTROL_CLASS}
                  >
                    <option value="">Empty</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}
                  </select>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" tone="neutral" size="sm" onClick={() => props.setPods((rows) => [...rows, { tableNumber: rows.length + 1, participantIds: [] }])}>
            <Plus size={14} /> Add pod
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {props.pairings.map((pairing, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-white/10 bg-black/25 p-3 md:grid-cols-[70px_1fr_1fr_auto]">
              <div className="pt-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">T{index + 1}</div>
              <select value={pairing.playerAId} onChange={(event) => props.setPairings((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, playerAId: event.target.value } : row))} className={CONTROL_CLASS}>
                <option value="">Player A</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}
              </select>
              <select value={pairing.playerBId ?? ""} onChange={(event) => props.setPairings((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, playerBId: event.target.value || null } : row))} className={CONTROL_CLASS}>
                <option value="">Bye</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}
              </select>
              <Button type="button" tone="danger" size="sm" onClick={() => props.setPairings((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button type="button" tone="neutral" size="sm" onClick={() => props.setPairings((rows) => [...rows, { tableNumber: rows.length + 1, playerAId: "", playerBId: null }])}>
            <Plus size={14} /> Add table
          </Button>
        </div>
      )}
    </div>
  );
}

function PlayersPanel({ tournament, busy, onDrop }: { tournament: TournamentSnapshot; busy: string | null; onDrop: (participantId?: string, reason?: "leave" | "kick") => void }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Players" subtitle={`${tournament.participants.length} registered`} />
      <div className="grid gap-3 xl:grid-cols-2">
        {tournament.participants.map((participant) => (
          <article key={participant.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="flex items-start gap-3">
              <PlayerAvatar participant={participant} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate text-base font-black text-white">{participant.displayName}</h3>
                  <StatusPill tone={participant.dropped ? "red" : "green"}>{participant.dropped ? "Dropped" : `Seed ${participant.seed}`}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  {participant.deckSubmitted ? `Deck: ${participant.deckName || participant.deckSource}` : "No deck submitted"}
                </p>
                {participant.deckVisible && participant.deck?.cards?.length ? (
                  <details className="mt-3 rounded-md border border-white/10 bg-neutral-950/70 p-3">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">View decklist</summary>
                    <div className="mt-2 max-h-48 overflow-y-auto text-xs leading-5 text-neutral-300">
                      {participant.deck.cards.map((card, index) => (
                        <div key={`${card.zone}-${card.name}-${index}`}>{card.qty} {card.name}{card.zone === "sideboard" ? " (SB)" : ""}</div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
            {tournament.isHost && !participant.dropped ? (
              <Button tone="danger" size="sm" onClick={() => onDrop(participant.id, "kick")} disabled={busy !== null}>
                <Ban size={14} /> Drop player
              </Button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function StandingsPanel({ tournament }: { tournament: TournamentSnapshot }) {
  const standings = tournament.standings ?? [];
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <div className="border-b border-white/10 p-4">
        <SectionHeader title="Standings" subtitle={tournament.mode === "commander_pods" ? "Pod points" : "Match points and tiebreakers"} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.12em] text-neutral-500">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pts</th>
              <th className="px-4 py-3">W-L-D</th>
              <th className="px-4 py-3">OMW</th>
              <th className="px-4 py-3">GWP</th>
              <th className="px-4 py-3">OGW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {standings.map((standing) => (
              <tr key={standing.participantId} className="text-neutral-200">
                <td className="px-4 py-3 font-black text-amber-200">#{standing.rank}</td>
                <td className="px-4 py-3 font-bold text-white">{participantName(tournament, standing.participantId)}</td>
                <td className="px-4 py-3">{standing.matchPoints}</td>
                <td className="px-4 py-3">{standing.wins}-{standing.losses}-{standing.draws}</td>
                <td className="px-4 py-3">{pct(standing.opponentMatchWinPct)}</td>
                <td className="px-4 py-3">{pct(standing.gameWinPct)}</td>
                <td className="px-4 py-3">{pct(standing.opponentGameWinPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!standings.length ? <EmptyState icon={<Medal size={24} />} title="No standings yet" body="Standings appear after rounds are created." /> : null}
    </div>
  );
}

function ActivityPanel({ tournament }: { tournament: TournamentSnapshot }) {
  const events = tournament.isHost ? [...tournament.hostEvents, ...tournament.activityEvents] : tournament.activityEvents;
  const uniqueEvents = Array.from(new Map(events.map((event) => [event.id, event])).values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="space-y-3">
      <SectionHeader title="Activity" subtitle={`${uniqueEvents.length} recent events`} />
      {uniqueEvents.map((event) => (
        <div key={event.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-white">{event.message || event.type.replaceAll("_", " ")}</span>
            <span className="text-xs text-neutral-500">{new Date(event.createdAt).toLocaleString()}</span>
          </div>
          {event.type === "participant_issue" && event.payload?.message ? (
            <p className="mt-2 text-sm text-amber-100">{String(event.payload.message)}</p>
          ) : null}
        </div>
      ))}
      {!uniqueEvents.length ? <EmptyState icon={<Activity size={24} />} title="No activity yet" body="Tournament changes and confirmations will appear here." /> : null}
    </div>
  );
}

function SettingsPanel(props: {
  tournament: TournamentSnapshot;
  setup: CreateTournamentInput;
  setSetup: (value: CreateTournamentInput | ((current: CreateTournamentInput) => CreateTournamentInput)) => void;
  venues: TournamentVenue[];
  busy: string | null;
  deckMode: DeckInputMode;
  setDeckMode: (value: DeckInputMode) => void;
  deckName: string;
  setDeckName: (value: string) => void;
  deckText: string;
  setDeckText: (value: string) => void;
  deckCards: TournamentDeckCard[];
  savedDecks: SavedDeckSummary[];
  selectedSavedDeckId: string;
  setSelectedSavedDeckId: (value: string) => void;
  deckImportUrl: string;
  setDeckImportUrl: (value: string) => void;
  hostDeckParticipantId: string;
  setHostDeckParticipantId: (value: string) => void;
  onUpdateSetup: () => void;
  onDeckUpdate: (event: FormEvent) => void;
  onImportDeck: () => void;
}) {
  const canEditSetup = props.tournament.isHost && props.tournament.status === "registration";
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <SectionHeader title="Tournament settings" subtitle={canEditSetup ? "Editable before start" : "Locked after start"} />
        <div className="mt-3 grid gap-3">
          <Field label="Title">
            <input value={props.setup.title} onChange={(event) => props.setSetup((current) => ({ ...current, title: event.target.value }))} className={CONTROL_CLASS} disabled={!canEditSetup} />
          </Field>
          <Field label="Venue">
            <select value={props.setup.venueId ?? ""} onChange={(event) => props.setSetup((current) => ({ ...current, venueId: event.target.value || null }))} className={CONTROL_CLASS} disabled={!canEditSetup}>
              <option value="">No venue</option>
              {props.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Player cap"><NumberInput value={props.setup.playerCap} min={2} max={128} disabled={!canEditSetup} onChange={(value) => props.setSetup((current) => ({ ...current, playerCap: value }))} /></Field>
            <Field label="Pairings">
              <select value={props.setup.pairingMode} onChange={(event) => props.setSetup((current) => ({ ...current, pairingMode: event.target.value as PairingMode }))} className={CONTROL_CLASS} disabled={!canEditSetup}>
                <option value="auto">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
          </div>
          {canEditSetup ? (
            <Button tone="amber" onClick={props.onUpdateSetup} disabled={props.busy !== null}>
              <Save size={16} /> Save setup
            </Button>
          ) : null}
        </div>
      </div>

      <form onSubmit={props.onDeckUpdate} className="rounded-lg border border-white/10 bg-black/30 p-4">
        <SectionHeader title={props.tournament.isHost ? "Deck submissions" : "My deck"} subtitle={props.tournament.status === "registration" ? "Decklists lock when the event starts" : "Locked"} />
        {props.tournament.isHost ? (
          <Field label="Player">
            <select value={props.hostDeckParticipantId} onChange={(event) => props.setHostDeckParticipantId(event.target.value)} className={CONTROL_CLASS}>
              <option value="">Pick player</option>
              {props.tournament.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
            </select>
          </Field>
        ) : null}
        <DeckSubmissionPanel
          deckRequired={(props.tournament.settings.deckSubmissionMode as DeckSubmissionMode) === "required"}
          deckMode={props.deckMode}
          setDeckMode={props.setDeckMode}
          deckName={props.deckName}
          setDeckName={props.setDeckName}
          deckText={props.deckText}
          setDeckText={props.setDeckText}
          deckCards={props.deckCards}
          deckImportUrl={props.deckImportUrl}
          setDeckImportUrl={props.setDeckImportUrl}
          selectedSavedDeckId={props.selectedSavedDeckId}
          setSelectedSavedDeckId={props.setSelectedSavedDeckId}
          savedDecks={props.savedDecks}
          userReady={props.savedDecks.length > 0}
          busy={props.busy}
          onImportDeck={props.onImportDeck}
        />
        {props.tournament.status === "registration" ? (
          <Button type="submit" tone="cyan" disabled={props.busy !== null || (props.tournament.isHost && !props.hostDeckParticipantId)}>
            <Upload size={16} /> Save deck
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function DeckSubmissionPanel(props: {
  deckRequired: boolean;
  deckMode: DeckInputMode;
  setDeckMode: (value: DeckInputMode) => void;
  deckName: string;
  setDeckName: (value: string) => void;
  deckText: string;
  setDeckText: (value: string) => void;
  deckCards: TournamentDeckCard[];
  deckImportUrl: string;
  setDeckImportUrl: (value: string) => void;
  selectedSavedDeckId: string;
  setSelectedSavedDeckId: (value: string) => void;
  savedDecks: SavedDeckSummary[];
  userReady: boolean;
  busy: string | null;
  onImportDeck: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-neutral-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Deck submission</h3>
        <StatusPill tone={props.deckRequired ? "amber" : "neutral"}>{props.deckRequired ? "Required" : "Optional"}</StatusPill>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {(["none", "saved", "pasted", "import"] as DeckInputMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => props.setDeckMode(mode)}
            className={cn("rounded-md border px-3 py-2 text-sm font-bold capitalize transition", props.deckMode === mode ? "border-cyan-300/55 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-black/30 text-neutral-300 hover:text-white")}
          >
            {mode}
          </button>
        ))}
      </div>

      {props.deckMode === "saved" ? (
        <Field label="Saved deck">
          <select value={props.selectedSavedDeckId} onChange={(event) => props.setSelectedSavedDeckId(event.target.value)} className={CONTROL_CLASS} disabled={!props.userReady}>
            <option value="">{props.userReady ? "Pick saved deck" : "Sign in to use saved decks"}</option>
            {props.savedDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title ?? deck.name ?? "Untitled"}{deck.format ? ` - ${deck.format}` : ""}</option>)}
          </select>
        </Field>
      ) : null}

      {props.deckMode === "import" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={props.deckImportUrl} onChange={(event) => props.setDeckImportUrl(event.target.value)} placeholder="Public Moxfield or Archidekt URL" className={CONTROL_CLASS} />
          <Button type="button" tone="neutral" onClick={props.onImportDeck} disabled={props.busy !== null}>
            <Upload size={15} /> Import
          </Button>
        </div>
      ) : null}

      {(props.deckMode === "pasted" || props.deckMode === "import") ? (
        <>
          <Field label="Deck name">
            <input value={props.deckName} onChange={(event) => props.setDeckName(event.target.value)} placeholder="Deck name" className={CONTROL_CLASS} maxLength={140} />
          </Field>
          <Field label={`Decklist ${props.deckCards.length ? `(${renderedDeckCount(props.deckCards)})` : ""}`}>
            <textarea value={props.deckText} onChange={(event) => props.setDeckText(event.target.value)} placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;&#10;Sideboard&#10;2 Negate" className={cn(CONTROL_CLASS, "min-h-44 font-mono text-xs")} maxLength={100000} />
          </Field>
        </>
      ) : null}
    </div>
  );
}

function RecentTournamentList({ title, rows, empty, onOpen }: { title: string; rows: TournamentListRow[]; empty: string; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 py-2 text-left transition hover:border-amber-300/35 hover:bg-amber-300/5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-bold text-white">{row.title}</span>
              <StatusPill tone={row.status === "active" ? "green" : "neutral"}>{row.status}</StatusPill>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{modeLabel(row.mode)} - round {row.current_round || 0}</p>
          </button>
        ))}
        {!rows.length ? <p className="text-sm text-neutral-500">{empty}</p> : null}
      </div>
    </div>
  );
}

function PlayerAvatar({ participant }: { participant: TournamentParticipant }) {
  const art = participant.art as PlayerArt | null;
  const imageUrl = art?.source === "scryfall" ? art.imageUrl : "";
  const color = art?.source === "color" ? art.colorHex : "#f59e0b";
  return imageUrl ? (
    <img src={imageUrl} alt="" className="h-12 w-12 rounded-md border border-white/10 object-cover" />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 text-sm font-black text-neutral-950" style={{ backgroundColor: color || "#f59e0b" }}>
      {participant.displayName.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, disabled }: { value: number; onChange: (value: number) => void; min: number; max: number; disabled?: boolean }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))}
      className={CONTROL_CLASS}
    />
  );
}

function Toggle({ checked, onChange, label, compact = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn("flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/30 text-left text-sm font-semibold text-neutral-200 transition hover:border-white/25", compact ? "px-3 py-2" : "px-4 py-3")}
    >
      <span>{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full border transition", checked ? "border-cyan-300/60 bg-cyan-300/30" : "border-white/20 bg-white/10")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition", checked ? "left-4" : "left-0.5")} />
      </span>
    </button>
  );
}

function Button({
  children,
  tone = "neutral",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "neutral" | "amber" | "cyan" | "green" | "danger"; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-black transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
        tone === "amber" && "border-amber-300/35 bg-amber-300 text-neutral-950 hover:bg-amber-200 focus-visible:ring-amber-300/70",
        tone === "cyan" && "border-cyan-300/35 bg-cyan-300 text-neutral-950 hover:bg-cyan-200 focus-visible:ring-cyan-300/70",
        tone === "green" && "border-emerald-300/35 bg-emerald-300 text-neutral-950 hover:bg-emerald-200 focus-visible:ring-emerald-300/70",
        tone === "danger" && "border-red-300/25 bg-red-500/12 text-red-100 hover:bg-red-500/20 focus-visible:ring-red-300/70",
        tone === "neutral" && "border-white/10 bg-white/[0.06] text-neutral-100 hover:border-white/25 hover:bg-white/[0.1] focus-visible:ring-white/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "cyan" | "green" | "red" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[11px] font-black uppercase tracking-[0.1em]",
        tone === "neutral" && "border-white/10 bg-white/[0.04] text-neutral-300",
        tone === "amber" && "border-amber-300/25 bg-amber-300/10 text-amber-100",
        tone === "cyan" && "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
        tone === "green" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        tone === "red" && "border-red-300/25 bg-red-300/10 text-red-100",
      )}
    >
      {children}
    </span>
  );
}

function NoticeBanner({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  return (
    <div className={cn("mt-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm", notice.type === "error" ? "border-red-300/25 bg-red-500/10 text-red-100" : notice.type === "success" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-cyan-300/25 bg-cyan-500/10 text-cyan-100")}>
      <span>{notice.message}</span>
      <button type="button" onClick={onClose} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss notice">
        <X size={15} />
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-white">{value}</div>
    </div>
  );
}

function Callout({ tone, icon, children }: { tone: "amber" | "green"; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("mt-3 flex gap-2 rounded-md border px-3 py-2 text-sm leading-5", tone === "amber" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100")}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-lg font-black text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-neutral-400">{subtitle}</p> : null}
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-300">{icon}</div>
      <h3 className="mt-3 text-lg font-black text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">{body}</p>
    </div>
  );
}
