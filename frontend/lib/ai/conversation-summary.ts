/**
 * Conversation summary generation for multi-turn memory
 */

export interface ConversationSummary {
  format?: string | null;
  budget?: string | null;
  colors?: string[];
  playstyle?: string | null;
  deckGoals?: string[];
  archetype?: string | null;
  commander?: string | null;
  deckName?: string | null;
  currentFocus?: string | null;
  constraints?: string[];
  decisions?: string[];
  mentionedCards?: string[];
  durableNotes?: string[];
  messageCount?: number;
  updatedAt?: string;
}

const MAX_TEXT_LENGTH = 180;
const MAX_ARRAY_ITEMS = 8;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SECRET_RE = /\b(password|passcode|api[_ -]?key|secret|access[_ -]?token|bearer|credit card|card number)\b/i;

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || EMAIL_RE.test(cleaned) || SECRET_RE.test(cleaned)) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

function cleanArray(value: unknown, maxItems = MAX_ARRAY_ITEMS, maxLength = 100): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const cleaned = cleanText(item, maxLength);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeSummary(input: ConversationSummary | null | undefined): ConversationSummary | null {
  if (!input || typeof input !== "object") return null;

  const summary: ConversationSummary = {
    format: cleanText(input.format, 60),
    budget: cleanText(input.budget, 80),
    colors: cleanArray(input.colors, 5, 12),
    playstyle: cleanText(input.playstyle, 80),
    deckGoals: cleanArray(input.deckGoals, 6, 120),
    archetype: cleanText(input.archetype, 80),
    commander: cleanText(input.commander, 120),
    deckName: cleanText(input.deckName, 120),
    currentFocus: cleanText(input.currentFocus, 160),
    constraints: cleanArray(input.constraints, 8, 140),
    decisions: cleanArray(input.decisions, 8, 140),
    mentionedCards: cleanArray(input.mentionedCards, 10, 100),
    durableNotes: cleanArray(input.durableNotes, 6, 140),
  };

  if (typeof input.messageCount === "number" && Number.isFinite(input.messageCount) && input.messageCount >= 0) {
    summary.messageCount = Math.floor(input.messageCount);
  }
  if (typeof input.updatedAt === "string") {
    const updatedAt = cleanText(input.updatedAt, 40);
    if (updatedAt) summary.updatedAt = updatedAt;
  }

  const hasContent = Object.entries(summary).some(([key, value]) => {
    if (key === "messageCount" || key === "updatedAt") return false;
    return Array.isArray(value) ? value.length > 0 : !!value;
  });

  return hasContent ? summary : null;
}

/**
 * Generate a summary prompt for the LLM
 */
export function buildSummaryPrompt(messages: Array<{ role: string; content: string }>): string {
  const recentMessages = messages
    .slice(-24)
    .map((m) => `${m.role}: ${String(m.content ?? "").slice(0, 2500)}`)
    .join("\n");
  
  return `Extract only stable, useful ManaTap chat memory from this conversation and return concise JSON:
{
  "format": "Commander/Modern/Standard/etc or null",
  "commander": "current commander if known or null",
  "deckName": "deck nickname/name if known or null",
  "budget": "budget/cheap/expensive/etc or null",
  "colors": ["W", "U", "B", "R", "G"] or [],
  "playstyle": "casual/competitive/optimized/etc or null",
  "archetype": "tokens/aristocrats/control/etc or null",
  "currentFocus": "what the user is currently trying to solve or null",
  "deckGoals": ["goal1", "goal2"] or [],
  "constraints": ["budget limit", "no infinite combos", "must keep pet card"] or [],
  "decisions": ["card/strategy choices already agreed"] or [],
  "mentionedCards": ["important card names discussed"] or [],
  "durableNotes": ["stable preferences explicitly stated in this thread"] or []
}

Rules:
- Prefer later messages when facts conflict.
- Do not include emails, passwords, tokens, payment info, addresses, or exact private identifiers.
- Do not invent facts. Use null or [] when unsure.
- Keep each field short.

Conversation:
${recentMessages}

Return only valid JSON, no other text.`;
}

/**
 * Parse summary from LLM response
 */
export function parseSummary(response: string): ConversationSummary | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return normalizeSummary(JSON.parse(jsonMatch[0]));
    }
    return normalizeSummary(JSON.parse(response));
  } catch {
    return null;
  }
}

/**
 * Format summary for injection into system prompt
 */
export function formatSummaryForPrompt(summary: ConversationSummary): string {
  const normalized = normalizeSummary(summary);
  if (!normalized) return "";

  const parts: string[] = [];
  
  if (normalized.format) parts.push(`Format: ${normalized.format}`);
  if (normalized.commander) parts.push(`Commander: ${normalized.commander}`);
  if (normalized.deckName) parts.push(`Deck: ${normalized.deckName}`);
  if (normalized.budget) parts.push(`Budget: ${normalized.budget}`);
  if (normalized.colors && normalized.colors.length > 0) parts.push(`Colors: ${normalized.colors.join(", ")}`);
  if (normalized.playstyle) parts.push(`Playstyle: ${normalized.playstyle}`);
  if (normalized.archetype) parts.push(`Archetype: ${normalized.archetype}`);
  if (normalized.currentFocus) parts.push(`Current focus: ${normalized.currentFocus}`);
  if (normalized.deckGoals && normalized.deckGoals.length > 0) parts.push(`Goals: ${normalized.deckGoals.join(", ")}`);
  if (normalized.constraints && normalized.constraints.length > 0) parts.push(`Constraints: ${normalized.constraints.join(", ")}`);
  if (normalized.decisions && normalized.decisions.length > 0) parts.push(`Decisions: ${normalized.decisions.join(", ")}`);
  if (normalized.mentionedCards && normalized.mentionedCards.length > 0) parts.push(`Important cards: ${normalized.mentionedCards.join(", ")}`);
  if (normalized.durableNotes && normalized.durableNotes.length > 0) parts.push(`Notes: ${normalized.durableNotes.join(", ")}`);
  
  if (parts.length === 0) return "";
  return `\n\nTHREAD MEMORY (advisory; current user message, linked deck data, and explicit deck context override this): ${parts.join(" | ")}.`;
}

