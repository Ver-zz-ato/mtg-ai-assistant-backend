"use client";

import React from "react";
import { BarChart3, Bot, ExternalLink, GitBranch, PiggyBank, Sparkles, X } from "lucide-react";

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
  onClose: () => void;
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

function formatUsd(price: number | null): string | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}

function openChatPrompt(prompt: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("manatap_pending_chat_prompt", prompt);
  if (window.location.pathname === "/") {
    window.dispatchEvent(new CustomEvent("manatap-chat-submit", { detail: { message: prompt } }));
    return;
  }
  window.location.href = "/";
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-neutral-950/70 p-3 text-left transition hover:border-amber-300/40 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-300/20 bg-amber-400/10 text-amber-200">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-100">{title}</span>
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
  onClose,
}: WebsiteCardDetailModalProps) {
  const [metadata, setMetadata] = React.useState<CardMetadata | null>(null);
  const [price, setPrice] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cleanName = cardName.trim();
  const cacheKey = normalizeCardKey(cleanName);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || !cleanName) return;
    let cancelled = false;

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

        if (priceCache.has(cacheKey)) {
          setPrice(priceCache.get(cacheKey) ?? null);
        } else {
          const response = await fetch(`/api/price?name=${encodeURIComponent(cleanName)}&currency=USD`, { cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          const nextPrice = typeof json?.price === "number" ? json.price : null;
          priceCache.set(cacheKey, nextPrice);
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
  }, [open, cleanName, cacheKey]);

  if (!open || !cleanName) return null;

  const displayName = metadata?.name || cleanName;
  const imageUrl = metadata?.image_uris?.normal || imageNormal || metadata?.image_uris?.small || imageSmall;
  const printLine = [metadata?.set ? String(metadata.set).toUpperCase() : "", metadata?.collector_number ? `#${metadata.collector_number}` : ""]
    .filter(Boolean)
    .join(" · ");
  const scryfallUrl = scryfallCardSearchUrl(displayName);
  const priceText = formatUsd(price);

  return (
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

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ActionButton
              icon={<Bot size={18} />}
              title="Explain this card"
              subtitle="Ask ManaTap what it does and where it fits."
              onClick={() => {
                onClose();
                openChatPrompt(`Explain ${displayName} simply. Cover what it does, what decks want it, and any rules traps.`);
              }}
            />
            <ActionButton
              icon={<BarChart3 size={18} />}
              title="Open in Price Tracker"
              subtitle="View price history and trend data."
              onClick={() => {
                onClose();
                window.location.href = `/price-tracker?card=${encodeURIComponent(displayName)}`;
              }}
            />
            <ActionButton
              icon={<Sparkles size={18} />}
              title="Find similar cards"
              subtitle="Ask for same-role cards and substitutes."
              onClick={() => {
                onClose();
                openChatPrompt(`Find cards similar to ${displayName}. Explain the role match and cheaper options if any.`);
              }}
            />
            <ActionButton
              icon={<GitBranch size={18} />}
              title="Combos and synergies"
              subtitle="Check combo lines and support pieces."
              onClick={() => {
                onClose();
                openChatPrompt(`What cards combo or synergize with ${displayName}? Separate fair synergies from true combo lines.`);
              }}
            />
            <ActionButton
              icon={<PiggyBank size={18} />}
              title="Budget alternatives"
              subtitle="Find cheaper cards for a similar job."
              onClick={() => {
                onClose();
                openChatPrompt(`Find budget alternatives for ${displayName}. Prioritize cards that fill the same role, and say what gets weaker.`);
              }}
            />
            <ActionButton
              icon={<ExternalLink size={18} />}
              title="Open in Scryfall"
              subtitle="Leave ManaTap for Scryfall details."
              onClick={() => window.open(scryfallUrl, "_blank", "noopener,noreferrer")}
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
  );
}

export { scryfallCardSearchUrl };
