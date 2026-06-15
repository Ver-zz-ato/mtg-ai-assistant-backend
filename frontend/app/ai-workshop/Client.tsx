"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ComputingModal from "@/components/ComputingModal";
import FixDeckNamesModal from "@/components/FixDeckNamesModal";
import { WorkshopActionGrid } from "@/components/ai-workshop/WorkshopActionGrid";
import { WorkshopAppliedBanner } from "@/components/ai-workshop/WorkshopAppliedBanner";
import { WorkshopDeckLoader } from "@/components/ai-workshop/WorkshopDeckLoader";
import { WorkshopDeckStrip } from "@/components/ai-workshop/WorkshopDeckStrip";
import { WorkshopIncompleteGate } from "@/components/ai-workshop/WorkshopIncompleteGate";
import { WorkshopSourceWarningGate } from "@/components/ai-workshop/WorkshopSourceWarningGate";
import { WorkshopPreviewPanel } from "@/components/ai-workshop/WorkshopPreviewPanel";
import { WorkshopSettingsPanel } from "@/components/ai-workshop/WorkshopSettingsPanel";
import { WorkshopWorkflowRail } from "@/components/ai-workshop/WorkshopWorkflowRail";
import type {
  PendingWorkshopPreview,
  PreviewDiffTab,
  UndoSnapshot,
  WorkshopBudgetSwapPair,
  WorkshopResultMeta,
} from "@/components/ai-workshop/types";
import {
  AI_WORKSHOP_HANDOFF_KEY,
  WORKSHOP_ACTIONS,
  type AiWorkshopHandoff,
} from "@/lib/deck/ai-workshop-actions";
import {
  applySelectedAiWorkshopBudgetSwapsToDeckText,
  applySelectedAiWorkshopDiffToDeckText,
  buildAiWorkshopBudgetSwapKey,
  buildAiWorkshopDiffKey,
  countAiWorkshopDeckCards,
  diffAiWorkshopDecklists,
} from "@/lib/deck/ai-workshop-deck-text";
import {
  collectDeckArtCandidateNames,
  deriveCommanderFromDeckText,
  detectCommander,
  filterSelectedChangeReasons,
  formatUsd,
  isBasicLandName,
  isCountMismatchWarning,
  normalizeChangeReasons,
  normalizeColorIdentity,
  normalizeSourceChip,
  pickArtFromImageMap,
} from "@/lib/deck/ai-workshop-helpers";
import {
  AI_WORKSHOP_MAX_CHANGE_OPTIONS,
  type AiWorkshopMaxChanges,
  type BudgetLevel,
  type PowerLevel,
  buildMaxChangesConstraint,
  budgetLevelToSwapThreshold,
  getAiDeckHalfwayMinimumCards,
  getAiWorkshopSubTargetOptions,
  getTargetCountForFormat,
  toMaxChangesLimit,
} from "@/lib/deck/ai-workshop-rules";
import {
  enrichSavedDeckRow,
  filterEligibleSavedDecks,
} from "@/lib/deck/tool-deck-eligibility";
import { previewFactsStrengthsRisks } from "@/lib/deck/preview-facts-adapter";
import { getFormatRules, isCommanderFormatString } from "@/lib/deck/formatRules";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";
import { track } from "@/lib/analytics/track";
import Link from "next/link";

type DeckRow = { id: string; title: string; format?: string; commander?: string; deck_text?: string };

type WorkshopSourcePreflight = {
  severity: "ok" | "review" | "blocked";
  expectedLegality: "noop" | "size_only_review" | "repair";
  issueSummary: {
    offColorLineCount: number;
    illegalLineCount: number;
    copyViolationCount: number;
    sourceCount: number;
    targetCount: number;
    sizeDelta: number;
    landCountSeverelyBroken: boolean;
  };
  messages: string[];
  suggestFixLegalityFirst: boolean;
};

export default function AiWorkshopClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isPro } = useProStatus();

  const queryDeckId = searchParams.get("deckId")?.trim() ?? "";

  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState(queryDeckId);
  const [bootLoading, setBootLoading] = useState(false);
  const [format, setFormat] = useState("Commander");
  const [deckText, setDeckText] = useState("");
  const [deckTitle, setDeckTitle] = useState("Untitled deck");
  const [deckCommander, setDeckCommander] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Loaded deck");
  const [commanderArt, setCommanderArt] = useState<string | null>(null);

  const [selectedActionId, setSelectedActionId] = useState("general");
  const [powerLevel, setPowerLevel] = useState<PowerLevel>("Casual");
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>("Moderate");
  const [maxChanges, setMaxChanges] = useState<AiWorkshopMaxChanges>("Up to 10 swaps");
  const [selectedSubTarget, setSelectedSubTarget] = useState("");
  const [preserveCommanderPackage, setPreserveCommanderPackage] = useState(true);
  const [lockManaBase, setLockManaBase] = useState(false);
  const [onlyChangeNonlands, setOnlyChangeNonlands] = useState(false);
  const [preserveCardsText, setPreserveCardsText] = useState("");
  const [avoidCardsThemesText, setAvoidCardsThemesText] = useState("");
  const [extraNotes, setExtraNotes] = useState("");

  const [workingDeckText, setWorkingDeckText] = useState("");
  const [lastBaseDeckText, setLastBaseDeckText] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<WorkshopResultMeta | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingWorkshopPreview | null>(null);
  const [selectedPreviewAddKeys, setSelectedPreviewAddKeys] = useState<string[]>([]);
  const [selectedPreviewCutKeys, setSelectedPreviewCutKeys] = useState<string[]>([]);
  const [selectedBudgetSwapKeys, setSelectedBudgetSwapKeys] = useState<string[]>([]);
  const [previewDiffTab, setPreviewDiffTab] = useState<PreviewDiffTab>("adds");
  const [showWhy, setShowWhy] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);

  const [fixNamesOpen, setFixNamesOpen] = useState(false);
  const [fixNamesItems, setFixNamesItems] = useState<
    Array<{ originalName: string; qty: number; suggestions: string[] }>
  >([]);
  const [pendingDeckText, setPendingDeckText] = useState("");
  const [sourcePreflight, setSourcePreflight] = useState<WorkshopSourcePreflight | null>(null);
  const [sourcePreflightLoading, setSourcePreflightLoading] = useState(false);
  const [sourceWarningConfirmed, setSourceWarningConfirmed] = useState(false);

  const transformAbortRef = useRef<AbortController | null>(null);
  const preflightAbortRef = useRef<AbortController | null>(null);
  const handoffLoadedRef = useRef(false);

  const selectedAction = useMemo(
    () => WORKSHOP_ACTIONS.find((a) => a.id === selectedActionId) ?? WORKSHOP_ACTIONS[0],
    [selectedActionId],
  );

  const availableMaxChangeOptions = useMemo<AiWorkshopMaxChanges[]>(() => {
    if (isPro) return [...AI_WORKSHOP_MAX_CHANGE_OPTIONS];
    if (user) return ["Up to 10 swaps", "Up to 20 swaps"];
    return ["Up to 10 swaps"];
  }, [isPro, user]);

  const activeDeckText = workingDeckText.trim() || deckText.trim();
  const currentCardCount = useMemo(
    () => (activeDeckText ? countAiWorkshopDeckCards(activeDeckText, format) : 0),
    [activeDeckText, format],
  );
  const workshopMinimumCards = useMemo(() => getAiDeckHalfwayMinimumCards(format), [format]);
  const expectedCardCount = useMemo(() => {
    const rules = getFormatRules(format);
    return rules?.mainDeckTarget ?? getTargetCountForFormat(format);
  }, [format]);
  const workshopBlocked = currentCardCount > 0 && currentCardCount < workshopMinimumCards;
  const savedDeckPicker = useMemo(() => {
    const enriched = decks
      .map((row) => enrichSavedDeckRow(row))
      .filter((row): row is NonNullable<typeof row> => row != null);
    return filterEligibleSavedDecks(enriched);
  }, [decks]);
  const sourceGateSeverity =
    sourcePreflight?.severity === "review" || sourcePreflight?.severity === "blocked"
      ? sourcePreflight.severity
      : null;
  const sourceRunBlocked =
    sourceGateSeverity === "blocked" &&
    selectedActionId !== "legality" &&
    !sourceWarningConfirmed;
  const isCommanderDeck = isCommanderFormatString(format);
  const commanderName = deckCommander.trim() || deriveCommanderFromDeckText(activeDeckText, deckTitle);

  const preserveCards = useMemo(
    () =>
      preserveCardsText
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 12),
    [preserveCardsText],
  );
  const avoidEntries = useMemo(
    () =>
      avoidCardsThemesText
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 12),
    [avoidCardsThemesText],
  );

  const workshopConstraints = useMemo(() => {
    const bits: string[] = [];
    bits.push(buildMaxChangesConstraint(maxChanges));
    if (preserveCommanderPackage && isCommanderDeck) {
      bits.push(
        commanderName
          ? `Do not cut ${commanderName} or the core commander package unless legality requires it. Preserve the main synergy engine and obvious signature payoffs when possible.`
          : "Do not cut the core commander package unless legality requires it. Preserve the main synergy engine and obvious signature payoffs when possible.",
      );
    }
    if (preserveCards.length) {
      bits.push(`Strongly preserve these cards if they remain legal and on-plan: ${preserveCards.join(", ")}.`);
    }
    if (lockManaBase) {
      bits.push(
        "Treat the current mana base as locked. Avoid changing lands, ramp, and fixing unless legality makes it necessary.",
      );
    }
    if (onlyChangeNonlands) {
      bits.push("Only change nonland cards unless legality makes a land change mandatory.");
    }
    if (avoidEntries.length) {
      bits.push(`Avoid these cards, themes, or patterns where possible: ${avoidEntries.join(", ")}.`);
    }
    if (selectedSubTarget.trim()) {
      bits.push(`Focus the pass primarily on this sub-target: ${selectedSubTarget.trim()}.`);
    }
    return bits.join("\n");
  }, [
    maxChanges,
    preserveCommanderPackage,
    isCommanderDeck,
    commanderName,
    preserveCards,
    lockManaBase,
    onlyChangeNonlands,
    avoidEntries,
    selectedSubTarget,
  ]);

  const pendingDiff = useMemo(
    () =>
      pendingPreview && pendingPreview.mode !== "budget_swaps"
        ? diffAiWorkshopDecklists(pendingPreview.baseDeckText, pendingPreview.deckText, format)
        : null,
    [pendingPreview, format],
  );

  const selectedPreviewAddSet = useMemo(() => new Set(selectedPreviewAddKeys), [selectedPreviewAddKeys]);
  const selectedPreviewCutSet = useMemo(() => new Set(selectedPreviewCutKeys), [selectedPreviewCutKeys]);
  const selectedBudgetSwapSet = useMemo(() => new Set(selectedBudgetSwapKeys), [selectedBudgetSwapKeys]);

  const selectedBudgetSwaps = useMemo(
    () =>
      pendingPreview?.budgetSwaps?.filter((p) => selectedBudgetSwapSet.has(buildAiWorkshopBudgetSwapKey(p))) ?? [],
    [pendingPreview?.budgetSwaps, selectedBudgetSwapSet],
  );
  const selectedBudgetSavings = useMemo(
    () => selectedBudgetSwaps.reduce((t, p) => t + Math.max(0, p.savings || 0), 0),
    [selectedBudgetSwaps],
  );

  const pendingPreviewAppliedDeckText = useMemo(() => {
    if (!pendingPreview) return "";
    if (pendingPreview.mode === "budget_swaps") {
      return applySelectedAiWorkshopBudgetSwapsToDeckText({
        baseDeckText: pendingPreview.baseDeckText,
        format,
        swaps: pendingPreview.budgetSwaps ?? [],
        selectedKeys: selectedBudgetSwapSet,
      });
    }
    if (!pendingDiff) return "";
    return applySelectedAiWorkshopDiffToDeckText({
      baseDeckText: pendingPreview.baseDeckText,
      format,
      adds: pendingDiff.adds,
      cuts: pendingDiff.cuts,
      selectedAddKeys: selectedPreviewAddSet,
      selectedCutKeys: selectedPreviewCutSet,
    });
  }, [pendingPreview, pendingDiff, selectedPreviewAddSet, selectedPreviewCutSet, selectedBudgetSwapSet, format]);

  const latestDiff = useMemo(
    () => (lastBaseDeckText ? diffAiWorkshopDecklists(lastBaseDeckText, workingDeckText, format) : null),
    [lastBaseDeckText, workingDeckText, format],
  );

  const targetCardCount = getTargetCountForFormat(format);
  const pendingPreviewDeckCount = useMemo(
    () => (pendingPreview?.deckText.trim() ? countAiWorkshopDeckCards(pendingPreview.deckText, format) : 0),
    [pendingPreview?.deckText, format],
  );
  const visiblePreviewWarnings = useMemo(() => {
    if (!pendingPreview?.warnings?.length) return [];
    if (pendingPreviewDeckCount === targetCardCount) {
      return pendingPreview.warnings.filter((w) => !isCountMismatchWarning(w));
    }
    return pendingPreview.warnings;
  }, [pendingPreview?.warnings, pendingPreviewDeckCount, targetCardCount]);

  const appliedMetaChips = useMemo(() => {
    if (!resultMeta) return [];
    const chips: string[] = [];
    if (latestDiff?.adds.length) chips.push(`+${latestDiff.adds.length} Added`);
    if (latestDiff?.cuts.length) chips.push(`-${latestDiff.cuts.length} Removed`);
    if (resultMeta.warnings?.length) chips.push(`${resultMeta.warnings.length} Notes`);
    return chips;
  }, [latestDiff, resultMeta]);

  const colorIdentityLabel = normalizeColorIdentity(resultMeta?.colors ?? null);

  useEffect(() => {
    if (!availableMaxChangeOptions.includes(maxChanges)) {
      setMaxChanges(availableMaxChangeOptions[availableMaxChangeOptions.length - 1]);
    }
  }, [availableMaxChangeOptions, maxChanges]);

  useEffect(() => {
    const options = getAiWorkshopSubTargetOptions(selectedActionId);
    if (!options.length) {
      setSelectedSubTarget("");
      return;
    }
    if (!options.includes(selectedSubTarget)) setSelectedSubTarget(options[0]);
  }, [selectedActionId, selectedSubTarget]);

  useEffect(() => {
    if (pendingPreview?.mode === "budget_swaps") {
      setSelectedPreviewAddKeys([]);
      setSelectedPreviewCutKeys([]);
      setSelectedBudgetSwapKeys((pendingPreview.budgetSwaps ?? []).map(buildAiWorkshopBudgetSwapKey));
      return;
    }
    if (!pendingDiff) {
      setSelectedPreviewAddKeys([]);
      setSelectedPreviewCutKeys([]);
      setSelectedBudgetSwapKeys([]);
      return;
    }
    setSelectedPreviewAddKeys(pendingDiff.adds.map(buildAiWorkshopDiffKey));
    setSelectedPreviewCutKeys(pendingDiff.cuts.map(buildAiWorkshopDiffKey));
    setPreviewDiffTab(pendingDiff.adds.length || !pendingDiff.cuts.length ? "adds" : "cuts");
  }, [pendingDiff, pendingPreview?.mode, pendingPreview?.budgetSwaps]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        setDecks([]);
        return;
      }
      try {
        const sb = createBrowserSupabaseClient();
        const { data } = await sb
          .from("decks")
          .select("id,title,format,commander,deck_text")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (alive) setDecks((data as DeckRow[]) ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (handoffLoadedRef.current) return;
    try {
      const raw = sessionStorage.getItem(AI_WORKSHOP_HANDOFF_KEY);
      if (!raw) return;
      const handoff = JSON.parse(raw) as AiWorkshopHandoff;
      if (!handoff.deckText?.trim()) return;
      handoffLoadedRef.current = true;
      sessionStorage.removeItem(AI_WORKSHOP_HANDOFF_KEY);
      setDeckText(handoff.deckText.trim());
      setWorkingDeckText(handoff.deckText.trim());
      if (handoff.format) setFormat(handoff.format);
      if (handoff.commander) setDeckCommander(handoff.commander);
      if (handoff.title) setDeckTitle(handoff.title);
      if (handoff.sourceLabel) setSourceLabel(handoff.sourceLabel);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!queryDeckId || !user) return;
    setSelectedDeckId(queryDeckId);
  }, [queryDeckId, user]);

  useEffect(() => {
    if (!selectedDeckId || !user) return;
    let cancelled = false;
    setBootLoading(true);
    void (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data } = await sb
          .from("decks")
          .select("id,title,format,commander,deck_text")
          .eq("id", selectedDeckId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled || !data?.deck_text?.trim()) return;
        const row = data as DeckRow;
        const text = row.deck_text!.trim();
        setDeckText(text);
        setWorkingDeckText(text);
        setDeckTitle(row.title?.trim() || "Untitled deck");
        setDeckCommander(row.commander?.trim() || detectCommander(text) || "");
        if (row.format?.trim()) setFormat(row.format.trim());
        setSourceLabel("Saved deck");
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDeckId, user]);

  useEffect(() => {
    if (!activeDeckText.trim() && !selectedDeckId) {
      setCommanderArt(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let art: string | null = null;

      if (selectedDeckId && user) {
        try {
          const r = await fetch(
            `/api/profile/banner-art?signatureDeckId=${encodeURIComponent(selectedDeckId)}`,
            { cache: "no-store" },
          );
          const j = await r.json().catch(() => ({ ok: false }));
          if (r.ok && j?.ok && j.art) art = String(j.art);
        } catch {
          /* ignore */
        }
      }

      const candidates = collectDeckArtCandidateNames(activeDeckText, commanderName, deckTitle);
      if (!art && candidates.length) {
        try {
          const { getImagesForNames } = await import("@/lib/scryfall-cache");
          const imageMap = await getImagesForNames(candidates);
          art = pickArtFromImageMap(candidates, imageMap);
        } catch {
          /* ignore */
        }
      }

      if (!art && commanderName && user) {
        try {
          const r = await fetch(
            `/api/profile/banner-art?favCommander=${encodeURIComponent(commanderName)}`,
            { cache: "no-store" },
          );
          const j = await r.json().catch(() => ({ ok: false }));
          if (r.ok && j?.ok && j.art) art = String(j.art);
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) setCommanderArt(art);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDeckText, commanderName, deckTitle, selectedDeckId, user]);

  const syncWorkingFromPaste = useCallback(() => {
    const raw = deckText.trim();
    if (raw) {
      setWorkingDeckText(raw);
      if (!deckCommander.trim() && isCommanderFormatString(format)) {
        const derived = deriveCommanderFromDeckText(raw, deckTitle);
        if (derived) setDeckCommander(derived);
      }
    }
  }, [deckText, deckCommander, deckTitle, format]);

  useEffect(() => {
    syncWorkingFromPaste();
  }, [deckText, syncWorkingFromPaste]);

  useEffect(() => {
    setSourceWarningConfirmed(false);
  }, [activeDeckText, format, deckCommander]);

  useEffect(() => {
    if (!user || workshopBlocked || !activeDeckText.trim()) {
      setSourcePreflight(null);
      setSourcePreflightLoading(false);
      return;
    }

    preflightAbortRef.current?.abort();
    const controller = new AbortController();
    preflightAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      setSourcePreflightLoading(true);
      void (async () => {
        try {
          const res = await fetch("/api/deck/workshop-preflight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deckText: activeDeckText,
              format,
              ...(commanderName ? { commander: commanderName } : {}),
            }),
            signal: controller.signal,
          });
          const json = await res.json().catch(() => ({}));
          if (controller.signal.aborted) return;
          if (res.ok && json.ok) {
            setSourcePreflight({
              severity: json.severity,
              expectedLegality: json.expectedLegality,
              issueSummary: json.issueSummary,
              messages: Array.isArray(json.messages)
                ? json.messages.filter((x: unknown): x is string => typeof x === "string")
                : [],
              suggestFixLegalityFirst: json.suggestFixLegalityFirst === true,
            });
          } else {
            setSourcePreflight(null);
          }
        } catch (error) {
          if ((error as Error).name !== "AbortError") setSourcePreflight(null);
        } finally {
          if (!controller.signal.aborted) setSourcePreflightLoading(false);
        }
      })();
    }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [user, workshopBlocked, activeDeckText, format, commanderName]);

  const requireSignIn = useCallback(() => {
    router.push(`/login?redirect=${encodeURIComponent("/ai-workshop")}`);
    return false;
  }, [router]);

  const runWorkshopPass = useCallback(async () => {
    if (!user) {
      requireSignIn();
      return;
    }
    const raw = (workingDeckText.trim() || deckText.trim());
    if (!raw) {
      setError("Load a deck list before running the workshop.");
      return;
    }
    if (sourceRunBlocked) {
      setError("Confirm commander and format, or run Fix legality first before this pass.");
      return;
    }
    setError(null);
    transformAbortRef.current?.abort();
    transformAbortRef.current = new AbortController();
    const signal = transformAbortRef.current.signal;
    setRunning(true);
    setPendingPreview(null);
    setShowWhy(false);

    track("ui_click", { area: "ai_workshop", action: "run_pass", pass: selectedAction.id }, {
      userId: user.id,
      isPro,
    });

    try {
      const mergedNotes = [selectedAction.defaultNotes, extraNotes.trim()].filter(Boolean).join("\n\n");

      if (selectedAction.id === "budget") {
        const res = await fetch("/api/deck/swap-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckText: raw,
            currency: "USD",
            budget: budgetLevelToSwapThreshold(budgetLevel),
            ai: true,
            format,
            ...(commanderName ? { commander: commanderName } : {}),
            sourcePage: "ai_workshop_budget",
          }),
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          if (json.code === "RATE_LIMIT_DAILY") {
            setShowProModal(true);
            return;
          }
          throw new Error(json.error || "Budget swaps failed");
        }
        const budgetSwaps: WorkshopBudgetSwapPair[] = (Array.isArray(json.suggestions) ? json.suggestions : [])
          .filter(
            (row: {
              from?: string;
              to?: string;
              price_from?: number;
              price_to?: number;
              rationale?: string;
              confidence?: number;
            }) =>
              row.from?.trim() &&
              row.to?.trim() &&
              (row.price_to ?? 0) > 0 &&
              (row.price_to ?? 0) < (row.price_from ?? 0) &&
              row.from.trim().toLowerCase() !== row.to.trim().toLowerCase() &&
              !isBasicLandName(row.from) &&
              !isBasicLandName(row.to),
          )
          .slice(0, toMaxChangesLimit(maxChanges) ?? 20)
          .map((row: {
            from: string;
            to: string;
            price_from: number;
            price_to: number;
            rationale?: string;
            confidence?: number;
          }) => ({
            from: row.from,
            to: row.to,
            qty: 1,
            priceFrom: row.price_from,
            priceTo: row.price_to,
            savings: Math.max(0, row.price_from - row.price_to),
            rationale: row.rationale || "",
            confidence: row.confidence ?? 0,
            currency: typeof json.currency === "string" ? json.currency : "USD",
          }));

        const previewDeckText = applySelectedAiWorkshopBudgetSwapsToDeckText({
          baseDeckText: raw,
          format,
          swaps: budgetSwaps,
          selectedKeys: new Set(budgetSwaps.map(buildAiWorkshopBudgetSwapKey)),
        });

        setPendingPreview({
          mode: "budget_swaps",
          deckText: previewDeckText,
          title: deckTitle,
          summary: budgetSwaps.length
            ? `Found ${budgetSwaps.length} validated 1-for-1 budget swap${budgetSwaps.length === 1 ? "" : "s"}.`
            : "No on-plan cheaper swaps found for this list.",
          whyText: budgetSwaps.length
            ? "These are validated one-for-one swaps from the Budget Swaps engine: each replacement is cheaper than the card it replaces and passed format, deck-membership, and color checks where available."
            : `No on-plan cheaper swaps were found at the ${budgetLevel} budget threshold. Try the High budget tier, pick Expensive staples as the sub-target, or run Fix legality first if the list has format or commander issues.`,
          previewFacts: null,
          colors: [],
          warnings: budgetSwaps.length
            ? []
            : [
                json.emptyReason === "no_cheaper_on_plan_swaps"
                  ? "No safe cheaper one-for-one swaps found at this budget level."
                  : "No safe cheaper one-for-one swaps found.",
              ],
          changeReasons: {
            added: Object.fromEntries(
              budgetSwaps.map((row) => [row.to.trim().toLowerCase(), row.rationale]),
            ),
            removed: Object.fromEntries(
              budgetSwaps.map((row) => [
                row.from.trim().toLowerCase(),
                `Replaced with ${row.to} to save about ${formatUsd(row.savings)} while keeping a similar role.`,
              ]),
            ),
          },
          baseDeckText: raw,
          commander: commanderName,
          budgetSwaps,
        });
        return;
      }

      const res = await fetch("/api/deck/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDeckText: raw,
          format,
          ...(commanderName ? { commander: commanderName } : {}),
          transformIntent: selectedAction.intent,
          powerLevel,
          budget: budgetLevel,
          ...(workshopConstraints.trim() ? { constraints: workshopConstraints.trim() } : {}),
          notes: mergedNotes,
          transformRules: {
            maxChanges: toMaxChangesLimit(maxChanges),
            preserveCommanderPackage,
            lockManaBase,
            onlyChangeNonlands,
            preserveCards,
            avoidCards: avoidEntries,
          },
        }),
        signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok !== true) {
        if (json.code === "RATE_LIMIT_DAILY") {
          setShowProModal(true);
          return;
        }
        if (json.code === "NEEDS_LEGALITY_FIRST") {
          setSelectedActionId("legality");
          setError(
            typeof json.error === "string"
              ? json.error
              : "Run Fix legality first before general cleanup on this list.",
          );
          return;
        }
        throw new Error(json.error || "AI refine failed");
      }

      const nextDeckText = (json.deckText ?? json.deck_text ?? "").trim();
      if (!nextDeckText) throw new Error("The AI did not return a revised list. Try a different pass.");

      setPendingPreview({
        deckText: nextDeckText,
        title: typeof json.title === "string" ? json.title.trim() : undefined,
        summary: typeof json.summary === "string" ? json.summary.trim() : undefined,
        plan: typeof json.plan === "string" ? json.plan.trim() : undefined,
        whyText: typeof json.why === "string" ? json.why.trim() : undefined,
        previewFacts:
          json.previewFacts != null && typeof json.previewFacts === "object"
            ? (json.previewFacts as Record<string, unknown>)
            : null,
        colors: Array.isArray(json.colors)
          ? json.colors.filter((x: unknown): x is string => typeof x === "string")
          : [],
        warnings: Array.isArray(json.warnings)
          ? json.warnings.filter((x: unknown): x is string => typeof x === "string")
          : [],
        changeReasons: normalizeChangeReasons(json.changeReasons),
        baseDeckText: raw,
        commander: commanderName,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setRunning(false);
      transformAbortRef.current = null;
    }
  }, [
    user,
    workingDeckText,
    deckText,
    requireSignIn,
    selectedAction,
    extraNotes,
    format,
    commanderName,
    budgetLevel,
    maxChanges,
    powerLevel,
    workshopConstraints,
    preserveCommanderPackage,
    lockManaBase,
    onlyChangeNonlands,
    preserveCards,
    avoidEntries,
    deckTitle,
    isPro,
    sourceRunBlocked,
  ]);

  const applyPendingPreview = useCallback(() => {
    if (!pendingPreview) return;
    const isBudgetPreview = pendingPreview.mode === "budget_swaps";
    if (!isBudgetPreview && !pendingDiff) return;
    const appliedDeckText = pendingPreviewAppliedDeckText.trim() || pendingPreview.baseDeckText.trim();
    const appliedCount = countAiWorkshopDeckCards(appliedDeckText, format);
    if (appliedCount < workshopMinimumCards) {
      setError(`Keep at least ${workshopMinimumCards} cards selected for ${format} before applying this pass.`);
      return;
    }
    setApplyingPreview(true);
    const snapshot: UndoSnapshot = {
      workingDeckText,
      deckTitle,
      deckCommander,
      resultMeta,
      lastBaseDeckText,
    };
    setUndoSnapshot(snapshot);
    setLastBaseDeckText(pendingPreview.baseDeckText);
    setWorkingDeckText(appliedDeckText);
    setDeckText(appliedDeckText);
    if (pendingPreview.commander.trim()) setDeckCommander(pendingPreview.commander.trim());
    if (pendingPreview.title?.trim()) setDeckTitle(pendingPreview.title.trim());

    const filteredReasons =
      isBudgetPreview || !pendingDiff
        ? pendingPreview.changeReasons ?? null
        : filterSelectedChangeReasons({
            reasons: pendingPreview.changeReasons,
            adds: pendingDiff.adds,
            cuts: pendingDiff.cuts,
            selectedAddKeys: selectedPreviewAddSet,
            selectedCutKeys: selectedPreviewCutSet,
          });

    setResultMeta({
      plan: pendingPreview.plan?.trim(),
      whyText: pendingPreview.whyText?.trim(),
      summary: pendingPreview.summary?.trim(),
      previewFacts: pendingPreview.previewFacts,
      colors: pendingPreview.colors,
      warnings: pendingPreview.warnings,
      changeReasons: filteredReasons,
    });
    setPendingPreview(null);
    setShowWhy(false);
    setApplyingPreview(false);
    track("ui_click", { area: "ai_workshop", action: "apply_preview" }, { userId: user?.id ?? null, isPro });
  }, [
    pendingPreview,
    pendingDiff,
    pendingPreviewAppliedDeckText,
    format,
    workshopMinimumCards,
    workingDeckText,
    deckTitle,
    deckCommander,
    resultMeta,
    lastBaseDeckText,
    selectedPreviewAddSet,
    selectedPreviewCutSet,
    user?.id,
    isPro,
  ]);

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return;
    setWorkingDeckText(undoSnapshot.workingDeckText);
    setDeckText(undoSnapshot.workingDeckText);
    setDeckTitle(undoSnapshot.deckTitle);
    setDeckCommander(undoSnapshot.deckCommander);
    setResultMeta(undoSnapshot.resultMeta);
    setLastBaseDeckText(undoSnapshot.lastBaseDeckText);
    setUndoSnapshot(null);
  }, [undoSnapshot]);

  const handleSaveDeck = useCallback(async () => {
    if (!user) {
      requireSignIn();
      return;
    }
    const raw = workingDeckText.trim();
    if (!raw) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deckTitle.trim() || "Refined deck",
          format,
          plan:
            resultMeta?.plan?.trim() ||
            resultMeta?.summary?.trim() ||
            `AI workshop refinement: ${selectedAction.title}.`,
          colors: resultMeta?.colors ?? [],
          deck_text: raw,
          commander: commanderName || undefined,
          is_public: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save deck");
      track("ui_click", { area: "ai_workshop", action: "save_deck" }, { userId: user.id, isPro });
      router.push(`/my-decks/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  }, [user, workingDeckText, deckTitle, format, resultMeta, selectedAction.title, commanderName, requireSignIn, router, isPro]);

  const openFixNames = useCallback(async () => {
    const text = deckText.trim();
    if (!text) return;
    setPendingDeckText(text);
    try {
      const res = await fetch("/api/deck/parse-and-fix-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText: text }),
      });
      const json = await res.json();
      if (res.ok && json?.ok && json?.items?.length) {
        setFixNamesItems(json.items);
        setFixNamesOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [deckText]);

  const applyFixNames = useCallback(
    (choices: Record<string, string>) => {
      void (async () => {
        try {
          const res = await fetch("/api/deck/parse-and-fix-names", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deckText: pendingDeckText }),
          });
          const json = await res.json();
          if (json?.ok && json.cards) {
            const corrected = json.cards.map((c: { name: string; qty: number }) => {
              const choice = choices[c.name];
              return { ...c, name: choice || c.name };
            });
            const correctedText = corrected
              .map((c: { qty: number; name: string }) => `${c.qty} ${c.name}`)
              .join("\n");
            setDeckText(correctedText);
            setWorkingDeckText(correctedText);
          }
        } catch {
          /* ignore */
        }
      })();
    },
    [pendingDeckText],
  );

  const hasLoadedDeck = Boolean(activeDeckText);
  const showLoader = !hasLoadedDeck;

  const clearLoadedDeck = useCallback(() => {
    setDeckText("");
    setWorkingDeckText("");
    setSelectedDeckId("");
    setPendingPreview(null);
    setResultMeta(null);
    setLastBaseDeckText(null);
    setUndoSnapshot(null);
    setShowWhy(false);
    setError(null);
    setSourceLabel("Loaded deck");
  }, []);

  return (
    <div className="w-full min-w-0">
      <ComputingModal
        isOpen={running}
        title="AI Workshop"
        indeterminate
        indeterminateLabel="Running your refinement pass…"
      />

      {showProModal ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowProModal(false)}
        >
          <div
            className="max-w-md w-full rounded-xl border border-amber-500/40 bg-neutral-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">Daily limit reached</h3>
            <p className="mt-2 text-sm text-neutral-300">
              You&apos;ve used today&apos;s 5 free AI Workshop refinements. Upgrade to Pro for unlimited passes.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/pricing"
                className="min-h-[40px] inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
              >
                Upgrade to Pro
              </Link>
              <button
                type="button"
                onClick={() => setShowProModal(false)}
                className="min-h-[40px] rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FixDeckNamesModal
        open={fixNamesOpen}
        items={fixNamesItems}
        onClose={() => setFixNamesOpen(false)}
        onApply={applyFixNames}
      />

      <header className="mb-4 rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-950/30 to-neutral-900/80 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">AI Deck Workshop</p>
        <h1 className="mt-2 text-2xl font-black text-white">Refine your deck with focused AI passes</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Load a list, pick a pass, review changes, and save a refined version. Sign in to run AI refinements.
        </p>
      </header>

      <WorkshopWorkflowRail
        hasDeck={hasLoadedDeck}
        hasResult={Boolean(pendingPreview || resultMeta)}
        hasApplied={Boolean(resultMeta)}
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {showLoader ? (
        <WorkshopDeckLoader
          deckText={deckText}
          format={format}
          commander={deckCommander}
          deckTitle={deckTitle}
          decks={savedDeckPicker.eligible.map((d) => ({
            id: d.id,
            title: d.title,
            cardCount: d.cardCount,
            format: d.format,
          }))}
          hiddenDeckCount={savedDeckPicker.hiddenCount}
          selectedDeckId={selectedDeckId}
          bootLoading={bootLoading}
          onDeckText={setDeckText}
          onFormat={setFormat}
          onCommander={setDeckCommander}
          onDeckTitle={setDeckTitle}
          onSelectDeckId={setSelectedDeckId}
          onFixNames={openFixNames}
        />
      ) : workshopBlocked ? (
        <WorkshopIncompleteGate
          format={format}
          currentCardCount={currentCardCount}
          expectedCardCount={expectedCardCount}
          workshopMinimumCards={workshopMinimumCards}
          deckId={selectedDeckId || queryDeckId || undefined}
        />
      ) : (
        <>
          <div className="mb-4">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={clearLoadedDeck}
                className="min-h-[40px] text-sm font-semibold text-violet-300 hover:text-violet-100 touch-manipulation"
              >
                Load a different deck
              </button>
            </div>
            <WorkshopDeckStrip
              deckTitle={deckTitle}
              sourceLabel={normalizeSourceChip(sourceLabel)}
              format={format}
              cardCount={currentCardCount}
              commander={commanderName}
              commanderArt={commanderArt}
              colorIdentityLabel={colorIdentityLabel}
              deckText={activeDeckText}
            />
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-300">Choose a pass</h3>
              <WorkshopActionGrid
                actions={WORKSHOP_ACTIONS}
                selectedId={selectedActionId}
                onSelect={setSelectedActionId}
                disabled={running || Boolean(pendingPreview)}
              />
            </div>

            <WorkshopSettingsPanel
              powerLevel={powerLevel}
              budgetLevel={budgetLevel}
              maxChanges={maxChanges}
              availableMaxChangeOptions={availableMaxChangeOptions}
              selectedActionId={selectedActionId}
              selectedSubTarget={selectedSubTarget}
              preserveCommanderPackage={preserveCommanderPackage}
              lockManaBase={lockManaBase}
              onlyChangeNonlands={onlyChangeNonlands}
              preserveCardsText={preserveCardsText}
              avoidCardsThemesText={avoidCardsThemesText}
              extraNotes={extraNotes}
              isCommanderDeck={isCommanderDeck}
              onPowerLevel={setPowerLevel}
              onBudgetLevel={setBudgetLevel}
              onMaxChanges={setMaxChanges}
              onSubTarget={setSelectedSubTarget}
              onPreserveCommanderPackage={setPreserveCommanderPackage}
              onLockManaBase={setLockManaBase}
              onOnlyChangeNonlands={setOnlyChangeNonlands}
              onPreserveCardsText={setPreserveCardsText}
              onAvoidCardsThemesText={setAvoidCardsThemesText}
              onExtraNotes={setExtraNotes}
            />

            {sourceGateSeverity && sourcePreflight ? (
              <WorkshopSourceWarningGate
                severity={sourceGateSeverity}
                format={format}
                commander={commanderName}
                issueSummary={sourcePreflight.issueSummary}
                messages={sourcePreflight.messages}
                selectedActionId={selectedActionId}
                confirmed={sourceWarningConfirmed}
                onConfirm={() => setSourceWarningConfirmed(true)}
                onSelectFixLegality={() => {
                  setSelectedActionId("legality");
                  setSourceWarningConfirmed(false);
                }}
              />
            ) : sourcePreflightLoading ? (
              <p className="text-xs text-neutral-500">Checking source deck for format issues…</p>
            ) : null}

            {!pendingPreview && !resultMeta ? (
              <button
                type="button"
                onClick={() => (user ? void runWorkshopPass() : requireSignIn())}
                disabled={running || sourceRunBlocked}
                className="w-full min-h-[48px] rounded-xl bg-violet-600 px-4 py-3 text-base font-bold text-white hover:bg-violet-500 disabled:opacity-60 touch-manipulation"
              >
                {user
                  ? running
                    ? "Running…"
                    : sourceRunBlocked
                      ? "Confirm source deck to continue"
                      : "Run refinement pass"
                  : "Sign in to run refinement"}
              </button>
            ) : null}

            {pendingPreview ? (
              <WorkshopPreviewPanel
                preview={pendingPreview}
                selectedActionId={selectedActionId}
                previewDiffTab={previewDiffTab}
                adds={pendingDiff?.adds ?? []}
                cuts={pendingDiff?.cuts ?? []}
                selectedAddKeys={selectedPreviewAddSet}
                selectedCutKeys={selectedPreviewCutSet}
                selectedBudgetSwapKeys={selectedBudgetSwapSet}
                selectedBudgetSavings={selectedBudgetSavings}
                visibleWarnings={visiblePreviewWarnings}
                previewSummaryLine={null}
                showWhy={showWhy}
                onPreviewDiffTab={setPreviewDiffTab}
                onToggleAdd={(key) =>
                  setSelectedPreviewAddKeys((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                onToggleCut={(key) =>
                  setSelectedPreviewCutKeys((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                onToggleBudgetSwap={(key) =>
                  setSelectedBudgetSwapKeys((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                onSelectAllAdds={() =>
                  setSelectedPreviewAddKeys((pendingDiff?.adds ?? []).map(buildAiWorkshopDiffKey))
                }
                onSelectAllCuts={() =>
                  setSelectedPreviewCutKeys((pendingDiff?.cuts ?? []).map(buildAiWorkshopDiffKey))
                }
                onSelectAllBudgetSwaps={() =>
                  setSelectedBudgetSwapKeys(
                    (pendingPreview.budgetSwaps ?? []).map(buildAiWorkshopBudgetSwapKey),
                  )
                }
                onToggleWhy={() => setShowWhy((v) => !v)}
                onDiscard={() => {
                  setPendingPreview(null);
                  setShowWhy(false);
                }}
                onApply={applyPendingPreview}
                applying={applyingPreview}
                buildDiffKey={buildAiWorkshopDiffKey}
                buildBudgetSwapKey={buildAiWorkshopBudgetSwapKey}
              />
            ) : null}

            {resultMeta && !pendingPreview ? (
              <WorkshopAppliedBanner
                selectedActionId={selectedActionId}
                resultMeta={resultMeta}
                appliedMetaChips={appliedMetaChips}
                latestAdds={latestDiff?.adds.length ?? 0}
                latestCuts={latestDiff?.cuts.length ?? 0}
                showWhy={showWhy}
                canUndo={Boolean(undoSnapshot)}
                saving={saving}
                onToggleWhy={() => setShowWhy((v) => !v)}
                onUndo={handleUndo}
                onSave={handleSaveDeck}
                onRunAnother={() => {
                  setResultMeta(null);
                  setShowWhy(false);
                }}
              />
            ) : null}

            {resultMeta?.previewFacts ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
                {(() => {
                  const { strengths, risks } = previewFactsStrengthsRisks(resultMeta.previewFacts);
                  return (
                    <>
                      {strengths.length > 0 ? (
                        <div className="mb-2">
                          <p className="text-xs font-bold uppercase text-emerald-300">Strengths</p>
                          <ul className="mt-1 list-disc pl-5">
                            {strengths.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {risks.length > 0 ? (
                        <div>
                          <p className="text-xs font-bold uppercase text-amber-300">Risks</p>
                          <ul className="mt-1 list-disc pl-5">
                            {risks.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
