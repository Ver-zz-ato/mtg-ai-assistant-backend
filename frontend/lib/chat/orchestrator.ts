import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

export type ChatToolKind =
  | "card_lookup"
  | "legality_check"
  | "price_lookup"
  | "cost_to_finish"
  | "budget_swaps"
  | "finish_suggestions";

export type ChatToolResult = {
  kind: ChatToolKind;
  ok: boolean;
  title: string;
  summary: string;
  data?: unknown;
  error?: string;
};

export type ChatTurnMetadata = {
  threadId?: string | null;
  assistantMessageId?: string | number | null;
  persisted?: boolean;
  toolResults?: ChatToolResult[];
  pendingDeckAction?: {
    id: string;
    deckId: string;
    status: string;
    summary: string;
    operations: unknown[];
    expiresAt?: string | null;
  } | null;
};

export const CHAT_METADATA_START = "__MANATAP_CHAT_METADATA__";
export const CHAT_METADATA_END = "__MANATAP_CHAT_METADATA_END__";

export function encodeChatMetadata(metadata: ChatTurnMetadata): string {
  return `\n${CHAT_METADATA_START}\n${JSON.stringify(metadata)}\n${CHAT_METADATA_END}\n`;
}

export function stripChatMetadata(text: string): { text: string; metadata: ChatTurnMetadata | null } {
  const raw = String(text || "");
  const start = raw.indexOf(CHAT_METADATA_START);
  if (start < 0) return { text: raw, metadata: null };
  const end = raw.indexOf(CHAT_METADATA_END, start);
  if (end < 0) return { text: raw.replace(CHAT_METADATA_START, "").trim(), metadata: null };
  const before = raw.slice(0, start);
  const jsonText = raw.slice(start + CHAT_METADATA_START.length, end).trim();
  const after = raw.slice(end + CHAT_METADATA_END.length);
  let metadata: ChatTurnMetadata | null = null;
  try {
    metadata = JSON.parse(jsonText) as ChatTurnMetadata;
  } catch {
    metadata = null;
  }
  return { text: `${before}${after}`.trim(), metadata };
}

export async function persistAssistantMessage(
  supabase: any,
  input: {
    threadId: string | null | undefined;
    content: string;
    metadata?: ChatTurnMetadata | null;
    suppressInsert?: boolean;
    isGuest?: boolean;
  },
): Promise<{ id: string | number | null; persisted: boolean }> {
  if (!input.threadId || input.suppressInsert || input.isGuest) return { id: null, persisted: false };
  const payload: Record<string, unknown> = {
    thread_id: input.threadId,
    role: "assistant",
    content: input.content,
  };
  if (input.metadata) payload.metadata = input.metadata;
  let { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error && input.metadata && isMissingMetadataColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.metadata;
    const fallback = await supabase
      .from("chat_messages")
      .insert(fallbackPayload)
      .select("id")
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return { id: (data as any)?.id ?? null, persisted: true };
}

export function isMissingMetadataColumnError(error: unknown): boolean {
  const msg = String((error as any)?.message || (error as any)?.details || error || "").toLowerCase();
  return msg.includes("metadata") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("column"));
}

export function shouldSkipRecommendationCleanupForChatTurn(text: string): boolean {
  const q = String(text || "").trim();
  if (!q) return false;
  return /\b(can i add|can i include|can this deck run|is\b.{0,90}\blegal\b|legal in|banned|allowed|rules?|rulings?|how does|how do|what does|what happens|interact|interaction|stack|priority|trample|deathtouch|lifelink|ward|menace|vigilance|flying|haste)\b/i.test(q);
}

export function buildToolResultsPrompt(results: ChatToolResult[]): string {
  const usable = results.filter((r) => r.ok || r.error);
  if (usable.length === 0) return "";
  const lines = usable.map((r) => {
    const status = r.ok ? "ok" : "unavailable";
    const data = r.data == null ? "" : `\nData: ${safeJson(r.data, 2200)}`;
    const err = r.error ? `\nError: ${r.error}` : "";
    return `- ${r.kind} (${status}): ${r.summary}${err}${data}`;
  });
  return [
    "TOOL_RESULTS:",
    "Use these grounded ManaTap tool results when answering. If a tool is unavailable, say that plainly and continue with best-effort MTG guidance.",
    ...lines,
  ].join("\n");
}

export function summarizeToolResults(results: ChatToolResult[]): ChatToolResult[] {
  return results.map((r) => ({
    kind: r.kind,
    ok: r.ok,
    title: r.title,
    summary: r.summary,
    error: r.error,
    data: compactToolData(r.data),
  }));
}

export function buildDirectChatToolAnswer(text: string, results: ChatToolResult[]): string | null {
  const simpleRules = simpleRulesAnswer(text);
  if (simpleRules) return simpleRules;

  const legality = results.find((r) => r.kind === "legality_check" && r.ok && r.data) as ChatToolResult | undefined;
  if (legality) {
    const answer = buildLegalityAnswer(text, legality.data);
    if (answer) return answer;
  }

  const price = results.find((r) => r.kind === "price_lookup" && r.ok && r.data) as ChatToolResult | undefined;
  if (price) {
    const answer = buildPriceAnswer(results, price.data);
    if (answer) return answer;
  }

  return null;
}

export async function runChatToolPlanner(input: {
  origin: string;
  cookieHeader?: string | null;
  authHeader?: string | null;
  text: string;
  deckText?: string | null;
  deckId?: string | null;
  format?: string | null;
  commander?: string | null;
  currency?: string | null;
  sourcePage?: string | null;
}): Promise<ChatToolResult[]> {
  const text = input.text || "";
  const lower = text.toLowerCase();
  const hasDeck = !!(input.deckText && input.deckText.trim()) || !!input.deckId;
  const results: ChatToolResult[] = [];

  const extractedNames = extractMentionedCardNames(text);
  const wantsCardLookup = extractedNames.length > 0 || /\b(what does|explain|tell me about|oracle text|card details)\b/i.test(text);
  const wantsPrice = /\b(price|worth|cost|market|trend|spike|crash|going up|going down)\b/i.test(text);
  const wantsLegality = /\b(legal|legality|banned|allowed|commander legal|modern legal|standard legal|pioneer legal|pauper legal)\b/i.test(text);
  const wantsCostToFinish = hasDeck && /\b(cost to finish|finish cost|how much.*(finish|complete)|missing.*cost|need to buy|collection|owned)\b/i.test(text);
  const wantsBudgetSwaps = hasDeck && /\b(budget swap|cheaper|cheap alternative|replace expensive|under\s?(?:usd|gbp|eur|[$])?\s?\d+|save money|budget)\b/i.test(text);
  const wantsFinish = hasDeck && /\b(finish this deck|complete this deck|what should i add|fill the deck|missing cards|upgrade this deck|improve this deck)\b/i.test(text);

  if (wantsCardLookup || wantsLegality) {
    const names = extractedNames.slice(0, 8);
    if (names.length > 0) {
      try {
        const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
        const details = await getDetailsForNamesCached(names);
        const cards = names.map((name) => {
          const key = normalizeScryfallCacheName(name);
          const row = details.get(key) || Array.from(details.values()).find((v: any) => normalizeScryfallCacheName(v?.name || "") === key);
          return row ? {
            name: row.name || row.card_name || name,
            type_line: row.type_line,
            mana_cost: row.mana_cost,
            color_identity: row.color_identity,
            legalities: row.legalities,
          } : { name, missing: true };
        });
        results.push({
          kind: wantsLegality ? "legality_check" : "card_lookup",
          ok: true,
          title: wantsLegality ? "Legality check" : "Card lookup",
          summary: `Resolved ${cards.filter((c: any) => !c.missing).length}/${names.length} mentioned cards from ManaTap card cache.`,
          data: { cards, format: input.format ?? null, commander: input.commander ?? null },
        });
      } catch (e: any) {
        results.push(toolError(wantsLegality ? "legality_check" : "card_lookup", "Card lookup", e));
      }
    }
  }

  if (wantsPrice && extractedNames.length > 0) {
    try {
      const names = extractedNames.slice(0, 12);
      const res = await fetch(`${trimOrigin(input.origin)}/api/price`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...forwardHeaders(input),
        },
        body: JSON.stringify({ names, currency: (input.currency || "USD").toUpperCase() }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      results.push({
        kind: "price_lookup",
        ok: res.ok && json?.ok !== false,
        title: "Price lookup",
        summary: res.ok ? `Fetched current price data for ${names.length} card(s).` : `Price lookup failed with HTTP ${res.status}.`,
        data: compactToolData(json),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (e: any) {
      results.push(toolError("price_lookup", "Price lookup", e));
    }
  }

  if (wantsCostToFinish) {
    results.push(await callJsonTool(input, "cost_to_finish", "Cost to Finish", "/api/collections/cost-to-finish", {
      deckId: input.deckId || undefined,
      deckText: input.deckText || undefined,
      format: input.format || undefined,
      currency: input.currency || "USD",
      useOwned: true,
    }));
  }

  if (wantsBudgetSwaps) {
    results.push(await callJsonTool(input, "budget_swaps", "Budget swaps", "/api/deck/swap-suggestions", {
      deckText: input.deckText || "",
      commander: input.commander || "",
      format: input.format || "Commander",
      currency: input.currency || "USD",
      sourcePage: input.sourcePage || "chat_tool_planner",
    }));
  }

  if (wantsFinish) {
    results.push(await callJsonTool(input, "finish_suggestions", "Finish suggestions", "/api/deck/finish-suggestions", {
      deckId: input.deckId || undefined,
      deckText: input.deckText || undefined,
      commander: input.commander || undefined,
      format: input.format || undefined,
      maxSuggestions: 8,
      budget: "balanced",
    }));
  }

  return results;
}

function extractMentionedCardNames(text: string): string[] {
  const names: string[] = [];
  const add = (value: string | undefined | null) => {
    const cleaned = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[?.!,;:]+$/g, "")
      .trim();
    if (cleaned.length >= 3 && cleaned.length <= 80 && !names.some((n) => n.toLowerCase() === cleaned.toLowerCase())) {
      names.push(cleaned);
    }
  };

  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) add(match[1]);
  for (const match of text.matchAll(/"([^"]+)"/g)) add(match[1]);
  for (const match of text.matchAll(/\b(?:price of|worth of|is|explain|about|lookup|find|card)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:legal|worth|cost|in|for|please|pls)|[?.!,]|$)/gi)) add(match[1]);
  for (const match of text.matchAll(/\b(?:add|include|run|play)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:to|in|for|please|pls)|[?.!,]|$)/g)) add(match[1]);
  return names.slice(0, 12);
}

function simpleRulesAnswer(text: string): string | null {
  const q = String(text || "").toLowerCase();
  if (/\btrample\b/.test(q) && /\bdeathtouch\b/.test(q)) {
    return "With trample plus deathtouch, you only need to assign 1 damage to each blocking creature because 1 deathtouch damage is lethal. Any remaining combat damage can be assigned to the defending player, planeswalker, or battle.";
  }
  const rules: Array<[RegExp, string]> = [
    [/\bwhat\s+(?:is|does)\s+trample\b|\btrample\s+do\b/, "Trample lets an attacking creature assign excess combat damage beyond its blockers to the defending player, planeswalker, or battle after assigning lethal damage to each blocker."],
    [/\bwhat\s+(?:is|does)\s+deathtouch\b|\bdeathtouch\s+do\b/, "Deathtouch means any amount of damage this source deals to a creature is lethal damage."],
    [/\bwhat\s+(?:is|does)\s+ward\b|\bward\s+do\b/, "Ward is a triggered protection ability: when the permanent becomes the target of an opponent's spell or ability, that opponent must pay the ward cost or the spell or ability is countered."],
    [/\bwhat\s+(?:is|does)\s+lifelink\b|\blifelink\s+do\b/, "Lifelink means damage dealt by that source also causes its controller to gain that much life at the same time."],
    [/\bwhat\s+(?:is|does)\s+vigilance\b|\bvigilance\s+do\b/, "Vigilance means a creature does not tap when it attacks."],
    [/\bwhat\s+(?:is|does)\s+haste\b|\bhaste\s+do\b/, "Haste lets a creature attack and use tap or untap abilities as soon as it comes under your control."],
  ];
  for (const [re, answer] of rules) {
    if (re.test(q)) return answer;
  }
  return null;
}

function buildLegalityAnswer(text: string, data: unknown): string | null {
  const d = data as any;
  const cards = Array.isArray(d?.cards) ? d.cards : [];
  if (cards.length === 0) return null;
  const formats = mentionedLegalityFormats(text, d?.format);
  if (formats.length === 0) return null;

  const lines: string[] = [];
  for (const card of cards) {
    if (card?.missing) {
      lines.push(`I couldn't resolve ${card.name}.`);
      continue;
    }
    const legalities = card?.legalities || {};
    const statuses = formats.map(({ key, label }) => `${label}: ${displayLegalityStatus(legalities[key])}`);
    lines.push(`[[${card.name}]] - ${statuses.join("; ")}.`);
  }
  return lines.length ? lines.join("\n") : null;
}

function mentionedLegalityFormats(text: string, fallback?: string | null): Array<{ key: string; label: string }> {
  const q = String(text || "").toLowerCase();
  const known = [
    ["commander", "Commander"],
    ["modern", "Modern"],
    ["standard", "Standard"],
    ["pioneer", "Pioneer"],
    ["pauper", "Pauper"],
    ["legacy", "Legacy"],
    ["vintage", "Vintage"],
    ["brawl", "Brawl"],
    ["historic", "Historic"],
    ["oathbreaker", "Oathbreaker"],
  ] as const;
  const found = known.filter(([key]) => q.includes(key)).map(([key, label]) => ({ key, label }));
  if (found.length > 0) return found;
  const f = String(fallback || "").toLowerCase();
  const match = known.find(([key]) => f.includes(key));
  return match ? [{ key: match[0], label: match[1] }] : [];
}

function displayLegalityStatus(value: unknown): string {
  const s = String(value || "unknown").toLowerCase();
  if (s === "legal") return "legal";
  if (s === "not_legal") return "not legal";
  if (s === "banned") return "banned";
  if (s === "restricted") return "restricted";
  return "unknown";
}

function buildPriceAnswer(results: ChatToolResult[], data: unknown): string | null {
  const d = data as any;
  const prices = d?.prices && typeof d.prices === "object" ? d.prices as Record<string, unknown> : null;
  if (!prices) return null;
  const currency = String(d?.currency || "USD").toUpperCase();
  const lookup = results.find((r) => r.kind === "card_lookup" && r.ok && r.data)?.data as any;
  const cards = Array.isArray(lookup?.cards) ? lookup.cards : [];
  const displayByNorm = new Map<string, string>();
  for (const card of cards) {
    if (card?.name) displayByNorm.set(normalizeScryfallCacheName(card.name), card.name);
  }

  const lines: string[] = [];
  const missingNames: string[] = [];
  for (const [rawName, rawPrice] of Object.entries(prices).slice(0, 6)) {
    const amount = Number(rawPrice);
    const display = displayByNorm.get(normalizeScryfallCacheName(rawName)) || titleizePriceKey(rawName);
    if (!Number.isFinite(amount) || amount <= 0) {
      missingNames.push(display);
      continue;
    }
    lines.push(`[[${display}]] is about ${formatPrice(amount, currency)} from ManaTap's current Scryfall-backed price cache.`);
  }
  if (lines.length > 0) return lines.join("\n");
  if (missingNames.length > 0) {
    return `I couldn't find a current nonzero ${currency} price for ${missingNames.map((n) => `[[${n}]]`).join(", ")} in ManaTap's Scryfall-backed price cache.`;
  }
  return null;
}

function titleizePriceKey(value: string): string {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPrice(amount: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${amount.toFixed(2)} ${currency}`;
}

async function callJsonTool(
  input: {
    origin: string;
    cookieHeader?: string | null;
    authHeader?: string | null;
  },
  kind: ChatToolKind,
  title: string,
  path: string,
  body: Record<string, unknown>,
): Promise<ChatToolResult> {
  try {
    const res = await fetch(`${trimOrigin(input.origin)}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...forwardHeaders(input),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return {
      kind,
      ok: res.ok && json?.ok !== false,
      title,
      summary: res.ok ? `${title} ran successfully.` : `${title} failed with HTTP ${res.status}.`,
      data: compactToolData(json),
      error: res.ok ? undefined : json?.error || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return toolError(kind, title, e);
  }
}

function forwardHeaders(input: { cookieHeader?: string | null; authHeader?: string | null }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.cookieHeader) headers.cookie = input.cookieHeader;
  if (input.authHeader) headers.Authorization = input.authHeader;
  return headers;
}

function trimOrigin(origin: string): string {
  return String(origin || "").replace(/\/+$/, "");
}

function toolError(kind: ChatToolKind, title: string, e: any): ChatToolResult {
  return {
    kind,
    ok: false,
    title,
    summary: `${title} could not run.`,
    error: e?.message || String(e || "unknown_error"),
  };
}

function compactToolData(data: unknown): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) return data.slice(0, 8);
  if (typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).slice(0, 18)) {
    const value = obj[key];
    if (Array.isArray(value)) out[key] = value.slice(0, 10);
    else if (value && typeof value === "object") out[key] = trimObject(value as Record<string, unknown>);
    else out[key] = value;
  }
  return out;
}

function trimObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).slice(0, 12)) out[key] = obj[key];
  return out;
}

function safeJson(value: unknown, max: number): string {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}...` : s;
  } catch {
    return String(value);
  }
}
