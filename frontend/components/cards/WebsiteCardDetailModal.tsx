"use client";

import React from "react";
import Link from "next/link";
import { BarChart3, Bot, ExternalLink, FolderPlus, GitBranch, Layers, Lock, PiggyBank, Sparkles, X } from "lucide-react";
import { normalizeCurrency, usePrefs, type CurrencyPref } from "@/components/PrefsContext";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toast-client";
import WebsiteAddCardDestinationModal from "@/components/cards/WebsiteAddCardDestinationModal";
import type { DeckUsageItem } from "@/lib/collection/deckCardUsage";
import { openChatPrompt } from "@/lib/navigation/chatRoute";

type CardMetadata = {
  name: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string | null;
  rarity?: string | null;
  set?: string | null;
  collector_number?: string | null;
  legalities?: Record<string, string>;
  image_uris?: {
    small?: string;
    normal?: string;
    art_crop?: string;
  };
};

type WebsiteCardDetailModalProps = {
  open: boolean;
  cardName: string;
  imageSmall?: string;
  imageNormal?: string;
  deckUsages?: DeckUsageItem[];
  onClose: () => void;
};

type ExplainMode = "eli5" | "tactics";
type ExplainTier = "guest" | "free" | "pro";
type ExplainResult =
  | {
      ok: true;
      mode: ExplainMode;
      tier: ExplainTier;
      text: string;
      remaining: number;
      limit: number;
      resetAt?: string | null;
    }
  | {
      ok: false;
      code?: string;
      error: string;
      tier?: ExplainTier;
      limit?: number;
      remaining?: number;
      resetAt?: string | null;
      requiresAuth?: boolean;
      proRequired?: boolean;
    };

type TacticBlock = {
  title: string;
  body: string;
};

const metadataCache = new Map<string, CardMetadata | null>();
const priceCache = new Map<string, number | null>();

const LEGALITY_FORMATS = [
  { key: "commander", label: "Commander" },
  { key: "modern", label: "Modern" },
  { key: "pioneer", label: "Pioneer" },
  { key: "standard", label: "Standard" },
  { key: "pauper", label: "Pauper" },
] as const;

function scryfallCardSearchUrl(cardName: string): string {
  const name = String(cardName || "").trim();
  const query = name ? `!"${name}"` : "";
  const params = new URLSearchParams({
    q: query,
    unique: "cards",
    as: "grid",
    order: "name",
  });
  return `https://scryfall.com/search?${params.toString()}`;
}

function normalizeCardKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rarityColor(rarity?: string | null): string {
  switch (String(rarity || "").toLowerCase()) {
    case "mythic":
      return "text-orange-300";
    case "rare":
      return "text-amber-300";
    case "uncommon":
      return "text-sky-300";
    case "common":
      return "text-neutral-300";
    default:
      return "text-neutral-400";
  }
}

function legalityStatus(legalities: Record<string, string> | undefined, key: string) {
  const raw = String(legalities?.[key] || "").toLowerCase();
  if (raw === "legal") return "legal";
  if (raw === "banned" || raw === "restricted") return "blocked";
  if (raw === "not_legal") return "not_legal";
  return "unknown";
}

function legalityLabel(status: string): string {
  if (status === "legal") return "Legal";
  if (status === "blocked") return "Banned / restricted";
  if (status === "not_legal") return "Not legal";
  return "Unknown";
}

function formatPrice(price: number | null, currency: CurrencyPref): string | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price);
}

function stripMarkdown(value: string): string {
  return value.replace(/\*\*/g, "").trim();
}

function parseTacticBlocks(text: string): TacticBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks = normalized
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const source = chunks.length > 1 ? chunks : normalized.split(/\n(?=\s*[-*]\s+\*\*)/);
  return source
    .map((chunk) => {
      const clean = chunk.replace(/^\s*[-*]\s+/, "").trim();
      const match = clean.match(/^\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
      if (match) return { title: stripMarkdown(match[1]), body: stripMarkdown(match[2]) };
      return { title: "Tactic note", body: stripMarkdown(clean) };
    })
    .filter((block) => block.title || block.body);
}

function friendlyExplainError(result: Extract<ExplainResult, { ok: false }>): string {
  if (result.code === "MISSING_ORACLE_TEXT") return "No rules text is available to explain for this card.";
  if (result.code === "RATE_LIMIT_DAILY") return "Daily card explanation limit reached. Try again tomorrow.";
  if (result.code === "BUDGET_LIMIT") return "ManaTap is busy right now. Try again later.";
  if (result.code === "AI_UNAVAILABLE") return "Card explanations are temporarily unavailable. Try again in a moment.";
  if (result.code === "VALIDATION_ERROR") return "This card could not be explained from the details available.";
  return result.error || "Could not explain this card. Try again in a moment.";
}

async function explainCardAi(params: {
  mode: ExplainMode;
  card: {
    name: string;
    displayName?: string | null;
    oracleText: string;
    typeLine?: string | null;
    manaCost?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
  };
  priorExplanation?: string | null;
}): Promise<ExplainResult> {
  const response = await fetch("/api/mobile/card/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: params.mode,
      card: params.card,
      priorExplanation: params.priorExplanation ?? null,
      sourcePage: "website_card_detail_modal",
    }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as ExplainResult;
  if (!response.ok && (!json || json.ok !== false)) {
    return { ok: false, error: `Request failed (${response.status}).` };
  }
  return json;
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  tone = "amber",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  tone?: "emerald" | "sky" | "violet" | "rose" | "amber" | "cyan";
}) {
  const toneClass = {
    emerald: {
      button: "border-emerald-300/15 bg-emerald-950/15 hover:border-emerald-300/50 hover:bg-emerald-950/30 focus:ring-emerald-300/60",
      icon: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
      title: "group-hover:text-emerald-100",
    },
    sky: {
      button: "border-sky-300/15 bg-sky-950/15 hover:border-sky-300/50 hover:bg-sky-950/30 focus:ring-sky-300/60",
      icon: "border-sky-300/25 bg-sky-400/10 text-sky-200",
      title: "group-hover:text-sky-100",
    },
    violet: {
      button: "border-violet-300/15 bg-violet-950/15 hover:border-violet-300/50 hover:bg-violet-950/30 focus:ring-violet-300/60",
      icon: "border-violet-300/25 bg-violet-400/10 text-violet-200",
      title: "group-hover:text-violet-100",
    },
    rose: {
      button: "border-rose-300/15 bg-rose-950/15 hover:border-rose-300/50 hover:bg-rose-950/30 focus:ring-rose-300/60",
      icon: "border-rose-300/25 bg-rose-400/10 text-rose-200",
      title: "group-hover:text-rose-100",
    },
    amber: {
      button: "border-amber-300/15 bg-amber-950/15 hover:border-amber-300/50 hover:bg-amber-950/30 focus:ring-amber-300/60",
      icon: "border-amber-300/25 bg-amber-400/10 text-amber-200",
      title: "group-hover:text-amber-100",
    },
    cyan: {
      button: "border-cyan-300/15 bg-cyan-950/15 hover:border-cyan-300/50 hover:bg-cyan-950/30 focus:ring-cyan-300/60",
      icon: "border-cyan-300/25 bg-cyan-400/10 text-cyan-200",
      title: "group-hover:text-cyan-100",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 ${toneClass.button}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${toneClass.icon}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold text-neutral-100 transition-colors ${toneClass.title}`}>{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-neutral-400">{subtitle}</span>
      </span>
    </button>
  );
}

export default function WebsiteCardDetailModal({
  open,
  cardName,
  imageSmall,
  imageNormal,
  deckUsages = [],
  onClose,
}: WebsiteCardDetailModalProps) {
  const { user } = useAuth();
  const { currency: prefCurrency } = usePrefs();
  const currency = normalizeCurrency(prefCurrency) || "USD";
  const [metadata, setMetadata] = React.useState<CardMetadata | null>(null);
  const [price, setPrice] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [explainLoading, setExplainLoading] = React.useState(false);
  const [tacticsLoading, setTacticsLoading] = React.useState(false);
  const [explanationText, setExplanationText] = React.useState<string | null>(null);
  const [tacticsText, setTacticsText] = React.useState<string | null>(null);
  const [explainError, setExplainError] = React.useState<string | null>(null);
  const [explainTier, setExplainTier] = React.useState<ExplainTier | null>(null);
  const [destinationPickerOpen, setDestinationPickerOpen] = React.useState(false);

  const cleanName = cardName.trim();
  const cacheKey = normalizeCardKey(cleanName);

  React.useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new Event("manatap-hide-hover-preview"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || !cleanName) return;
    let cancelled = false;
    setExplanationText(null);
    setTacticsText(null);
    setExplainError(null);
    setExplainTier(null);

    async function load() {
      setError(null);
      setLoading(true);
      try {
        if (metadataCache.has(cacheKey)) {
          setMetadata(metadataCache.get(cacheKey) ?? null);
        } else {
          const response = await fetch("/api/cards/batch-metadata", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ names: [cleanName] }),
            cache: "no-store",
          });
          const json = await response.json().catch(() => ({}));
          const row = Array.isArray(json?.data) ? (json.data[0] as CardMetadata | undefined) : undefined;
          const nextMetadata = row ?? null;
          metadataCache.set(cacheKey, nextMetadata);
          if (!cancelled) setMetadata(nextMetadata);
        }

        const priceCacheKey = `${cacheKey}:${currency}`;
        if (priceCache.has(priceCacheKey)) {
          setPrice(priceCache.get(priceCacheKey) ?? null);
        } else {
          const response = await fetch(`/api/price?name=${encodeURIComponent(cleanName)}&currency=${encodeURIComponent(currency)}`, { cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          const nextPrice = typeof json?.price === "number" ? json.price : null;
          priceCache.set(priceCacheKey, nextPrice);
          if (!cancelled) setPrice(nextPrice);
        }
      } catch {
        if (!cancelled) setError("Card details could not be loaded. You can still open the card on Scryfall.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, cleanName, cacheKey, currency]);

  if (!open || !cleanName) return null;

  const displayName = metadata?.name || cleanName;
  const imageUrl = metadata?.image_uris?.normal || imageNormal || metadata?.image_uris?.small || imageSmall;
  const printLine = [metadata?.set ? String(metadata.set).toUpperCase() : "", metadata?.collector_number ? `#${metadata.collector_number}` : ""]
    .filter(Boolean)
    .join(" · ");
  const scryfallUrl = scryfallCardSearchUrl(displayName);
  const priceText = formatPrice(price, currency);
  const hasOracleText = Boolean(metadata?.oracle_text?.trim());
  const explainCard = {
    name: displayName,
    displayName,
    oracleText: metadata?.oracle_text?.trim() || "",
    typeLine: metadata?.type_line ?? null,
    manaCost: metadata?.mana_cost ?? null,
    setCode: metadata?.set ?? null,
    collectorNumber: metadata?.collector_number ?? null,
  };
  const isProTier = explainTier === "pro";
  const tacticBlocks = tacticsText ? parseTacticBlocks(tacticsText) : [];

  async function handleExplainCard() {
    if (!hasOracleText || explainLoading) return;
    setExplainLoading(true);
    setExplainError(null);
    setTacticsText(null);
    try {
      const result = await explainCardAi({ mode: "eli5", card: explainCard });
      if (result.ok) {
        setExplanationText(result.text);
        setExplainTier(result.tier);
      } else {
        setExplainError(friendlyExplainError(result));
        setExplainTier(result.tier ?? null);
      }
    } finally {
      setExplainLoading(false);
    }
  }

  async function handleTactics() {
    if (!hasOracleText || !explanationText || tacticsLoading || !isProTier) return;
    setTacticsLoading(true);
    setExplainError(null);
    try {
      const result = await explainCardAi({
        mode: "tactics",
        card: explainCard,
        priorExplanation: explanationText,
      });
      if (result.ok) {
        setTacticsText(result.text);
        setExplainTier(result.tier);
      } else {
        setExplainError(friendlyExplainError(result));
        setExplainTier(result.tier ?? explainTier);
      }
    } finally {
      setTacticsLoading(false);
    }
  }

  function handleAddTo() {
    if (!user) {
      toast("Sign in to add cards to your collections, decks, or wishlists.", "info");
      return;
    }
    setDestinationPickerOpen(true);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="relative grid max-h-[90vh] w-full max-w-4xl gap-5 overflow-y-auto rounded-xl border border-amber-300/20 bg-[#11100d] p-4 shadow-2xl shadow-black/60 md:grid-cols-[minmax(220px,320px)_1fr] md:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={`${displayName} card details`}
          onClick={(event) => event.stopPropagation()}
        >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md border border-white/10 bg-black/50 p-2 text-neutral-300 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          aria-label="Close card details"
        >
          <X size={18} />
        </button>

        <div className="pt-8 md:pt-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={displayName}
              className="mx-auto aspect-[488/680] w-full max-w-[320px] rounded-lg border border-white/10 bg-neutral-950 object-contain shadow-xl"
            />
          ) : (
            <div className="mx-auto flex aspect-[488/680] w-full max-w-[320px] items-center justify-center rounded-lg border border-white/10 bg-neutral-950 text-sm text-neutral-500">
              {loading ? "Loading card..." : "No image available"}
            </div>
          )}
          {deckUsages.length > 0 ? (
            <div className="mx-auto mt-3 w-full max-w-[320px] rounded-lg border border-indigo-300/20 bg-indigo-950/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-100">
                <Layers size={16} />
                <span>In your decks</span>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-indigo-200/10">
                {deckUsages.map((usage) => (
                  <Link
                    key={usage.deckId}
                    href={`/my-decks/${usage.deckId}`}
                    onClick={onClose}
                    className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-indigo-100"
                  >
                    <span className="truncate text-neutral-200" title={usage.deckTitle}>
                      {usage.deckTitle}
                    </span>
                    <span className="shrink-0 tabular-nums text-neutral-400">x{usage.qty}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="pr-10">
            <h2 className="text-xl font-bold text-neutral-100 md:text-2xl">{displayName}</h2>
            {printLine ? <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{printLine}</p> : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {metadata?.mana_cost ? <span className="rounded-md border border-white/10 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-300">{metadata.mana_cost}</span> : null}
            {metadata?.rarity ? <span className={`rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs font-semibold capitalize ${rarityColor(metadata.rarity)}`}>{metadata.rarity}</span> : null}
            {priceText ? <span className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">{priceText}</span> : null}
          </div>

          {metadata?.type_line ? <p className="mt-3 text-sm italic text-neutral-300">{metadata.type_line}</p> : null}
          {metadata?.oracle_text ? (
            <div className="mt-3 whitespace-pre-line rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-6 text-neutral-200">
              {metadata.oracle_text}
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-blue-300/25 bg-blue-950/20 p-3">
            <button
              type="button"
              onClick={() => void handleExplainCard()}
              disabled={!hasOracleText || explainLoading}
              className="flex w-full items-center gap-3 rounded-lg border border-blue-300/20 bg-neutral-950/70 p-3 text-left transition hover:border-blue-200/50 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-blue-300/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-300/20 bg-blue-400/10 text-blue-100">
                <Bot size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-100">
                  {explainLoading ? "Explaining..." : "Explain this card"}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-neutral-400">
                  Ask ManaTap what it does and where it fits.
                </span>
              </span>
              {explainLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" /> : null}
            </button>

            {!hasOracleText && !loading ? (
              <p className="mt-2 text-xs text-neutral-500">No rules text is available to explain for this card.</p>
            ) : null}

            {explanationText ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-200">Simple explanation</div>
                <p className="mt-2 text-sm leading-6 text-neutral-200">{explanationText}</p>
              </div>
            ) : null}

            {explanationText && !tacticsText ? (
              isProTier ? (
                <button
                  type="button"
                  onClick={() => void handleTactics()}
                  disabled={tacticsLoading}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-200/50 hover:bg-violet-500/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {tacticsLoading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-100 border-t-transparent" /> : <Sparkles size={15} />}
                  {tacticsLoading ? "Explaining..." : "Show deeper tactics"}
                  <span className="rounded-full border border-violet-200/30 px-1.5 py-0.5 text-[10px] uppercase text-violet-100">Pro</span>
                </button>
              ) : (
                <Link
                  href="/pricing"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-200/50 hover:bg-violet-500/15"
                >
                  <Lock size={14} />
                  Show deeper tactics
                  <span className="rounded-full border border-violet-200/30 px-1.5 py-0.5 text-[10px] uppercase text-violet-100">Pro</span>
                </Link>
              )
            ) : null}

            {tacticsText ? (
              <div className="mt-3 rounded-lg border border-violet-300/20 bg-violet-950/20 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-violet-200">Deeper tactics</div>
                <div className="mt-2 space-y-2">
                  {(tacticBlocks.length ? tacticBlocks : [{ title: "Tactic note", body: tacticsText }]).map((block, index) => (
                    <div key={`${block.title}-${index}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-sm font-semibold text-neutral-100">{block.title}</div>
                      {block.body ? <p className="mt-1 text-sm leading-5 text-neutral-300">{block.body}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {explainError ? (
              <div className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                {explainError}
              </div>
            ) : null}
          </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ActionButton
                icon={<FolderPlus size={18} />}
                title="Add to..."
                subtitle={user ? "Save this card to a collection, deck, or wishlist." : "Sign in to save this card to your account."}
                onClick={handleAddTo}
                tone="emerald"
              />
              <ActionButton
                icon={<BarChart3 size={18} />}
                title="Open in Price Tracker"
                subtitle="View price history and trend data."
                onClick={() => {
                  onClose();
                  window.location.href = `/price-tracker?card=${encodeURIComponent(displayName)}`;
                }}
                tone="sky"
              />
              <ActionButton
                icon={<Sparkles size={18} />}
                title="Find similar cards"
                subtitle="Ask for same-role cards and substitutes."
                onClick={() => {
                  onClose();
                  openChatPrompt(`Find cards similar to ${displayName}. Explain the role match and cheaper options if any.`);
                }}
                tone="violet"
              />
              <ActionButton
                icon={<GitBranch size={18} />}
                title="Combos and synergies"
                subtitle="Check combo lines and support pieces."
                onClick={() => {
                  onClose();
                  openChatPrompt(`What cards combo or synergize with ${displayName}? Separate fair synergies from true combo lines.`);
                }}
                tone="cyan"
              />
              <ActionButton
                icon={<PiggyBank size={18} />}
                title="Budget alternatives"
                subtitle="Find cheaper cards for a similar job."
                onClick={() => {
                  onClose();
                  openChatPrompt(`Find budget alternatives for ${displayName}. Prioritize cards that fill the same role, and say what gets weaker.`);
                }}
                tone="rose"
              />
              <ActionButton
                icon={<ExternalLink size={18} />}
                title="Open in Scryfall"
                subtitle="Leave ManaTap for Scryfall details."
                onClick={() => window.open(scryfallUrl, "_blank", "noopener,noreferrer")}
                tone="amber"
              />
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-semibold text-neutral-100">Format legalities</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LEGALITY_FORMATS.map((format) => {
                  const status = legalityStatus(metadata?.legalities, format.key);
                  const tone =
                    status === "legal"
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                      : status === "unknown"
                        ? "border-neutral-500/20 bg-neutral-500/10 text-neutral-300"
                        : "border-red-300/20 bg-red-400/10 text-red-200";
                  return (
                    <div key={format.key} className="rounded-md border border-white/10 bg-neutral-950/60 p-2 text-center">
                      <div className="text-xs font-semibold text-neutral-200">{format.label}</div>
                      <div className={`mt-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${tone}`}>
                        {loading && !metadata ? "Loading" : legalityLabel(status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <WebsiteAddCardDestinationModal
        open={destinationPickerOpen}
        onClose={() => setDestinationPickerOpen(false)}
        cards={[{ name: displayName, qty: 1 }]}
        title="Add to collection, deck, or wishlist"
        subtitle={displayName}
      />
    </>
  );
}

export { scryfallCardSearchUrl };
