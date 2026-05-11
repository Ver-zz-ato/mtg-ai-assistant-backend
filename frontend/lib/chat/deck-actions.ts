import { createHash } from "crypto";
import { normalizeCardName } from "@/lib/deck/mtgValidators";

export type DeckChangeOperation =
  | { type: "add"; name: string; qty: number; zone: "mainboard" | "sideboard" }
  | { type: "remove"; name: string; qty: number; zone: "mainboard" | "sideboard" }
  | { type: "swap"; remove: string; add: string; qty: number; zone: "mainboard" | "sideboard" };

export type DeckChangeProposal = {
  id: string;
  deckId: string;
  status: string;
  summary: string;
  operations: DeckChangeOperation[];
  expiresAt?: string | null;
};

type DeckCardRow = {
  id?: string;
  deck_id?: string;
  name: string;
  qty?: number | null;
  zone?: string | null;
};

export function parseDeckChangeIntent(text: string): DeckChangeOperation[] | null {
  const raw = String(text || "").trim();
  const zone: "mainboard" | "sideboard" = /\b(sideboard|side board)\b/i.test(raw) ? "sideboard" : "mainboard";

  const add = raw.match(/^(?:please\s+)?add\s+(?:(\d+)\s*x?\s+)?(.+?)(?:\s+to\s+(?:the\s+)?(?:deck|mainboard|sideboard))?[.!?]?$/i);
  if (add) {
    const qty = clampQty(add[1] ? Number(add[1]) : 1);
    const name = cleanCommandCardName(add[2]);
    if (name) return [{ type: "add", name, qty, zone }];
  }

  const remove = raw.match(/^(?:please\s+)?(?:remove|cut)\s+(?:(\d+)\s*x?\s+)?(.+?)(?:\s+from\s+(?:the\s+)?(?:deck|mainboard|sideboard))?[.!?]?$/i);
  if (remove) {
    const qty = clampQty(remove[1] ? Number(remove[1]) : 1);
    const name = cleanCommandCardName(remove[2]);
    if (name) return [{ type: "remove", name, qty, zone }];
  }

  const swap = raw.match(/^(?:please\s+)?(?:swap|replace)\s+(.+?)\s+(?:for|with)\s+(.+?)[.!?]?$/i);
  if (swap) {
    const removeName = cleanCommandCardName(swap[1]);
    const addName = cleanCommandCardName(swap[2]);
    if (removeName && addName) return [{ type: "swap", remove: removeName, add: addName, qty: 1, zone }];
  }

  return null;
}

export async function maybeCreateDeckChangeProposal(input: {
  supabase: any;
  userId: string | null;
  threadId: string | null;
  deckId: string | null;
  text: string;
}): Promise<{ proposal: DeckChangeProposal; assistantText: string } | null> {
  const operations = parseDeckChangeIntent(input.text);
  if (!operations || operations.length === 0) return null;
  if (!input.userId || !input.threadId || !input.deckId) return null;

  const { data: deck, error: deckErr } = await input.supabase
    .from("decks")
    .select("id,user_id,title,format,commander")
    .eq("id", input.deckId)
    .maybeSingle();
  if (deckErr || !deck || (deck as any).user_id !== input.userId) return null;

  const { data: rows, error: rowsErr } = await input.supabase
    .from("deck_cards")
    .select("id,deck_id,name,qty,zone")
    .eq("deck_id", input.deckId)
    .limit(500);
  if (rowsErr) throw rowsErr;

  const beforeRows = ((rows || []) as DeckCardRow[]).map(normalizeDeckRow);
  const resolvedOps = await resolveOperationNames(operations);
  const validation = validateOperations(resolvedOps, beforeRows);
  const hashBefore = deckRowsHash(beforeRows);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: inserted, error } = await input.supabase
    .from("chat_deck_change_proposals")
    .insert({
      thread_id: input.threadId,
      deck_id: input.deckId,
      user_id: input.userId,
      status: "pending",
      operations: resolvedOps,
      validation,
      deck_hash_before: hashBefore,
      before_rows: beforeRows,
      expires_at: expiresAt,
    })
    .select("id,status,operations,expires_at")
    .maybeSingle();
  if (error) throw error;

  const id = String((inserted as any)?.id || "");
  const proposal: DeckChangeProposal = {
    id,
    deckId: input.deckId,
    status: "pending",
    operations: resolvedOps,
    expiresAt,
    summary: summarizeOperations(resolvedOps),
  };

  const warningText = validation.warnings.length > 0
    ? `\n\nWarnings: ${validation.warnings.join(" ")}`
    : "";
  return {
    proposal,
    assistantText: `I can make this deck change, but I will not edit the deck until you confirm.\n\n${proposal.summary}${warningText}\n\nUse Apply to commit it, or Cancel to ignore it.`,
  };
}

export async function applyDeckChangeProposal(input: {
  supabase: any;
  userId: string;
  proposalId: string;
}): Promise<{ ok: true; deckId: string; summary: string } | { ok: false; error: string; code?: string }> {
  const proposal = await fetchOwnedProposal(input.supabase, input.userId, input.proposalId);
  if (!proposal.ok) return proposal;
  const p = proposal.row;
  if (p.status !== "pending") return { ok: false, error: "This deck change is no longer pending.", code: "not_pending" };
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) {
    await input.supabase.from("chat_deck_change_proposals").update({ status: "expired" }).eq("id", input.proposalId);
    return { ok: false, error: "This deck change expired. Ask me to prepare it again.", code: "expired" };
  }

  const currentRows = await fetchDeckRows(input.supabase, p.deck_id);
  if (deckRowsHash(currentRows) !== p.deck_hash_before) {
    return { ok: false, error: "Your deck changed since this proposal was created. Ask me to prepare the change again.", code: "stale_deck" };
  }

  for (const op of p.operations as DeckChangeOperation[]) {
    if (op.type === "add") await addCard(input.supabase, p.deck_id, op.name, op.qty, op.zone);
    if (op.type === "remove") await removeCard(input.supabase, p.deck_id, op.name, op.qty, op.zone);
    if (op.type === "swap") {
      await removeCard(input.supabase, p.deck_id, op.remove, op.qty, op.zone);
      await addCard(input.supabase, p.deck_id, op.add, op.qty, op.zone);
    }
  }

  const afterRows = await fetchDeckRows(input.supabase, p.deck_id);
  await input.supabase
    .from("chat_deck_change_proposals")
    .update({ status: "applied", after_rows: afterRows, applied_at: new Date().toISOString() })
    .eq("id", input.proposalId);

  return { ok: true, deckId: p.deck_id, summary: summarizeOperations(p.operations as DeckChangeOperation[]) };
}

export async function cancelDeckChangeProposal(input: {
  supabase: any;
  userId: string;
  proposalId: string;
}): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const proposal = await fetchOwnedProposal(input.supabase, input.userId, input.proposalId);
  if (!proposal.ok) return proposal;
  if (proposal.row.status !== "pending") return { ok: false, error: "This deck change is no longer pending.", code: "not_pending" };
  await input.supabase
    .from("chat_deck_change_proposals")
    .update({ status: "cancelled" })
    .eq("id", input.proposalId);
  return { ok: true };
}

export async function undoDeckChangeProposal(input: {
  supabase: any;
  userId: string;
  proposalId: string;
}): Promise<{ ok: true; deckId: string } | { ok: false; error: string; code?: string }> {
  const proposal = await fetchOwnedProposal(input.supabase, input.userId, input.proposalId);
  if (!proposal.ok) return proposal;
  const p = proposal.row;
  if (p.status !== "applied") return { ok: false, error: "Only applied deck changes can be undone.", code: "not_applied" };
  const beforeRows = Array.isArray(p.before_rows) ? p.before_rows.map(normalizeDeckRow) : [];
  await input.supabase.from("deck_cards").delete().eq("deck_id", p.deck_id);
  if (beforeRows.length > 0) {
    const rows = beforeRows.map((r: DeckCardRow) => ({
      deck_id: p.deck_id,
      name: r.name,
      qty: r.qty || 1,
      zone: r.zone || "mainboard",
    }));
    const { error } = await input.supabase.from("deck_cards").insert(rows);
    if (error) throw error;
  }
  await input.supabase
    .from("chat_deck_change_proposals")
    .update({ status: "undone", undone_at: new Date().toISOString() })
    .eq("id", input.proposalId);
  return { ok: true, deckId: p.deck_id };
}

export function deckRowsHash(rows: DeckCardRow[]): string {
  const stable = rows
    .map(normalizeDeckRow)
    .sort((a, b) => `${a.zone}:${a.name}`.localeCompare(`${b.zone}:${b.name}`));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function cleanCommandCardName(value: string): string {
  return String(value || "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(?:please|thanks|thank you)\b/gi, "")
    .trim();
}

function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(99, Math.floor(qty)));
}

async function resolveOperationNames(operations: DeckChangeOperation[]): Promise<DeckChangeOperation[]> {
  return Promise.all(operations.map(async (op) => {
    if (op.type === "add") return { ...op, name: await resolveCardName(op.name) };
    if (op.type === "remove") return { ...op, name: await resolveCardName(op.name) };
    return { ...op, remove: await resolveCardName(op.remove), add: await resolveCardName(op.add) };
  }));
}

async function resolveCardName(name: string): Promise<string> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { cache: "no-store" });
    if (!res.ok) return name;
    const json = await res.json().catch(() => ({}));
    return typeof json?.name === "string" && json.name.trim() ? json.name.trim() : name;
  } catch {
    return name;
  }
}

function validateOperations(operations: DeckChangeOperation[], beforeRows: DeckCardRow[]): { warnings: string[] } {
  const warnings: string[] = [];
  const hasCard = (name: string, zone: string) => beforeRows.some((r) => normalizeCardName(r.name) === normalizeCardName(name) && (r.zone || "mainboard") === zone);
  for (const op of operations) {
    if (op.type === "remove" && !hasCard(op.name, op.zone)) warnings.push(`${op.name} was not found in ${op.zone}.`);
    if (op.type === "swap" && !hasCard(op.remove, op.zone)) warnings.push(`${op.remove} was not found in ${op.zone}.`);
  }
  return { warnings };
}

function summarizeOperations(operations: DeckChangeOperation[]): string {
  return operations.map((op) => {
    if (op.type === "add") return `Add ${op.qty}x [[${op.name}]] to ${op.zone}.`;
    if (op.type === "remove") return `Remove ${op.qty}x [[${op.name}]] from ${op.zone}.`;
    return `Swap ${op.qty}x [[${op.remove}]] for [[${op.add}]] in ${op.zone}.`;
  }).join("\n");
}

function normalizeDeckRow(row: DeckCardRow): DeckCardRow {
  return {
    name: String(row.name || "").trim(),
    qty: Math.max(1, Number(row.qty || 1)),
    zone: String(row.zone || "mainboard"),
  };
}

async function fetchDeckRows(supabase: any, deckId: string): Promise<DeckCardRow[]> {
  const { data, error } = await supabase
    .from("deck_cards")
    .select("id,deck_id,name,qty,zone")
    .eq("deck_id", deckId)
    .limit(500);
  if (error) throw error;
  return ((data || []) as DeckCardRow[]).map(normalizeDeckRow);
}

async function fetchOwnedProposal(supabase: any, userId: string, proposalId: string): Promise<{ ok: true; row: any } | { ok: false; error: string; code?: string }> {
  const { data, error } = await supabase
    .from("chat_deck_change_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, code: "db_error" };
  if (!data || (data as any).user_id !== userId) return { ok: false, error: "Deck change proposal not found.", code: "not_found" };
  return { ok: true, row: data };
}

async function addCard(supabase: any, deckId: string, name: string, qty: number, zone: string): Promise<void> {
  const { data: existing } = await supabase
    .from("deck_cards")
    .select("id,qty")
    .eq("deck_id", deckId)
    .eq("name", name)
    .eq("zone", zone)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from("deck_cards")
      .update({ qty: Number(existing.qty || 1) + qty })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("deck_cards")
      .insert({ deck_id: deckId, name, qty, zone });
    if (error) throw error;
  }
}

async function removeCard(supabase: any, deckId: string, name: string, qty: number, zone: string): Promise<void> {
  const { data: existing } = await supabase
    .from("deck_cards")
    .select("id,qty")
    .eq("deck_id", deckId)
    .eq("name", name)
    .eq("zone", zone)
    .maybeSingle();
  if (!existing?.id) return;
  const nextQty = Number(existing.qty || 1) - qty;
  if (nextQty > 0) {
    const { error } = await supabase.from("deck_cards").update({ qty: nextQty }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("deck_cards").delete().eq("id", existing.id);
    if (error) throw error;
  }
}
