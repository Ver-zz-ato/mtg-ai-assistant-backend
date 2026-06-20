import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { fetchExternalDeck, discoverArchidektRecentDecks } from "./adapters";
import { countCards, stableDeckHash } from "./hash";
import { isSourceCoolingDown, markSourceFailure, markSourceSuccess, politeDelay, retryAfterToCooldownIso } from "./rateLimit";
import type {
  ExclusionReason,
  ExternalDeckIngestSummary,
  ExternalDeckSourceKey,
  ExternalDeckSourceRow,
  NormalizedExternalDeck,
} from "./types";
import { parseExternalDeckUrl, sourceDeckUrl } from "./url";

const COMMANDER_MIN_CARDS = 80;
const CONSTRUCTED_MIN_CARDS = 40;
const SUPPORT_CARDS = [
  "Sol Ring",
  "Arcane Signet",
  "Command Tower",
  "Swords to Plowshares",
  "Path to Exile",
  "Cyclonic Rift",
  "Heroic Intervention",
  "Swiftfoot Boots",
  "Lightning Greaves",
  "Rhystic Study",
  "Smothering Tithe",
] as const;

function emptySummary(): ExternalDeckIngestSummary {
  return {
    queued: 0,
    processed: 0,
    insertedOrUpdated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    discovered: 0,
    rollupsWritten: 0,
    profilesWritten: 0,
    errors: [],
  };
}

function sourceRows(data: unknown): ExternalDeckSourceRow[] {
  return Array.isArray(data) ? (data as ExternalDeckSourceRow[]) : [];
}

export async function queueExternalDeckUrls(
  admin: SupabaseClient,
  urls: string[],
  submittedBy?: string | null
): Promise<{ queued: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  const rows = [];
  for (const raw of urls) {
    const parsed = parseExternalDeckUrl(raw);
    if (!parsed) {
      errors.push(`unsupported_url:${String(raw).slice(0, 120)}`);
      continue;
    }
    rows.push({
      source_key: parsed.sourceKey,
      external_id: parsed.externalId,
      url: parsed.canonicalUrl,
      submitted_by: submittedBy ?? null,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return { queued: 0, skipped: 0, errors };
  const { error } = await admin.from("external_deck_ingest_queue").upsert(rows, {
    onConflict: "source_key,external_id",
    ignoreDuplicates: false,
  });
  if (error) throw new Error(error.message);
  return { queued: rows.length, skipped: 0, errors };
}

export async function discoverArchidektQueue(admin: SupabaseClient): Promise<number> {
  const ids = await discoverArchidektRecentDecks();
  if (ids.length === 0) return 0;
  const { queued } = await queueExternalDeckUrls(
    admin,
    ids.map((id) => sourceDeckUrl("archidekt", id)),
    null
  );
  return queued;
}

function normalizeFormat(format: string | null | undefined): string | null {
  const f = String(format || "").trim().toLowerCase();
  if (!f) return null;
  if (f.includes("commander") || f === "edh" || f === "cedh") return "commander";
  if (f.includes("standard")) return "standard";
  if (f.includes("modern")) return "modern";
  if (f.includes("pioneer")) return "pioneer";
  if (f.includes("pauper")) return "pauper";
  if (f.includes("legacy")) return "legacy";
  if (f.includes("vintage")) return "vintage";
  if (f.includes("brawl")) return "brawl";
  return f.slice(0, 40);
}

function validateDeck(deck: NormalizedExternalDeck): { valid: boolean; reason: ExclusionReason | null; format: string | null } {
  const format = normalizeFormat(deck.format);
  if (!format) return { valid: false, reason: "invalid_format", format: null };
  const isCommander = format === "commander" || format === "brawl";
  if (isCommander && deck.commanders.length === 0) return { valid: false, reason: "missing_commander", format };
  const cardCount = countCards(deck.cards);
  if (isCommander && cardCount < COMMANDER_MIN_CARDS) return { valid: false, reason: "too_few_cards", format };
  if (!isCommander && cardCount < CONSTRUCTED_MIN_CARDS) return { valid: false, reason: "too_few_cards", format };
  return { valid: true, reason: null, format };
}

async function hasDuplicateApprovedHash(admin: SupabaseClient, deckHash: string, sourceKey: string, externalId: string): Promise<boolean> {
  const { count } = await admin
    .from("external_decks")
    .select("id", { count: "exact", head: true })
    .eq("deck_hash", deckHash)
    .eq("aggregate_approved", true)
    .not("source_key", "eq", sourceKey)
    .neq("external_id", externalId);
  return (count ?? 0) > 0;
}

async function fetchCardFacts(
  admin: SupabaseClient,
  names: string[]
): Promise<Map<string, { type_line?: string | null; oracle_text?: string | null; cmc?: number | null }>> {
  const keys = [...new Set(names.map(normalizeScryfallCacheName).filter(Boolean))];
  const out = new Map<string, { type_line?: string | null; oracle_text?: string | null; cmc?: number | null }>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await admin
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, cmc")
      .in("name", keys.slice(i, i + 100));
    for (const row of data ?? []) {
      const r = row as { name: string; type_line?: string | null; oracle_text?: string | null; cmc?: number | null };
      out.set(r.name, { type_line: r.type_line, oracle_text: r.oracle_text, cmc: r.cmc });
    }
  }
  return out;
}

async function persistDeck(
  admin: SupabaseClient,
  deck: NormalizedExternalDeck,
  source: ExternalDeckSourceRow
): Promise<"updated" | "unchanged" | "skipped"> {
  const hash = stableDeckHash(deck);
  const validation = validateDeck(deck);
  let isValid = validation.valid;
  let reason = validation.reason;
  if (isValid && (await hasDuplicateApprovedHash(admin, hash, deck.sourceKey, deck.externalId))) {
    isValid = false;
    reason = "duplicate_deck_hash";
  }
  const existing = await admin
    .from("external_decks")
    .select("id, deck_hash")
    .eq("source_key", deck.sourceKey)
    .eq("external_id", deck.externalId)
    .maybeSingle();
  if (existing.data?.deck_hash === hash) {
    await admin
      .from("external_decks")
      .update({
        format: validation.format,
        commanders: deck.commanders,
        mainboard_count: countCards(deck.cards, ["mainboard", "commander"]),
        sideboard_count: countCards(deck.cards, ["sideboard"]),
        is_valid: isValid,
        aggregate_approved: isValid && source.approved_for_profiles,
        exclusion_reason: reason,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing.data as { id: string }).id);
    return "unchanged";
  }

  const mainboardCount = countCards(deck.cards, ["mainboard", "commander"]);
  const sideboardCount = countCards(deck.cards, ["sideboard"]);
  const row = {
    source_key: deck.sourceKey,
    external_id: deck.externalId,
    url: deck.url,
    title: deck.title ?? null,
    owner_name: deck.ownerName ?? null,
    format: validation.format,
    commanders: deck.commanders,
    mainboard_count: mainboardCount,
    sideboard_count: sideboardCount,
    deck_hash: hash,
    is_valid: isValid,
    aggregate_approved: isValid && source.approved_for_profiles,
    exclusion_reason: reason,
    source_payload: deck.sourcePayload ?? {},
    published_at: deck.publishedAt ?? null,
    external_updated_at: deck.externalUpdatedAt ?? null,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("external_decks")
    .upsert(row, { onConflict: "source_key,external_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const deckId = (data as { id: string }).id;
  await admin.from("external_deck_cards").delete().eq("external_deck_id", deckId);
  const cardRows = deck.cards
    .filter((card) => card.name.trim())
    .map((card) => ({
      external_deck_id: deckId,
      source_key: deck.sourceKey,
      external_deck_source_id: deck.externalId,
      board: card.board,
      quantity: Math.max(1, Number(card.quantity) || 1),
      card_name: card.name.trim(),
      card_name_norm: normalizeScryfallCacheName(card.name),
      category: card.category ?? null,
    }));
  if (cardRows.length > 0) {
    const { error: cardsError } = await admin.from("external_deck_cards").insert(cardRows);
    if (cardsError) throw new Error(cardsError.message);
  }
  return "updated";
}

async function processQueueForSource(
  admin: SupabaseClient,
  source: ExternalDeckSourceRow,
  summary: ExternalDeckIngestSummary
): Promise<void> {
  if (!source.enabled || isSourceCoolingDown(source)) {
    summary.skipped += 1;
    return;
  }
  const { data: queueRows } = await admin
    .from("external_deck_ingest_queue")
    .select("id, source_key, external_id, url, attempts")
    .eq("source_key", source.source_key)
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(source.max_decks_per_run);

  for (const raw of queueRows ?? []) {
    const q = raw as { id: string; external_id: string; attempts: number };
    summary.processed += 1;
    await admin.from("external_deck_ingest_queue").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", q.id);
    const fetched = await fetchExternalDeck(source.source_key, q.external_id);
    if (!fetched.ok) {
      summary.failed += 1;
      const code = fetched.status === 429 ? "rate_limited" : fetched.status === 403 ? "private_unavailable" : "fetch_failed";
      const cooldown =
        fetched.status === 429
          ? retryAfterToCooldownIso(fetched.retryAfter ?? null, 6)
          : fetched.status === 403
            ? retryAfterToCooldownIso(null, 24)
            : null;
      await markSourceFailure(admin, source, fetched.error, { cooldownUntil: cooldown });
      await admin
        .from("external_deck_ingest_queue")
        .update({
          status: "failed",
          attempts: (q.attempts ?? 0) + 1,
          last_error: fetched.error.slice(0, 500),
          last_error_code: code,
          next_attempt_at: cooldown ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", q.id);
      summary.errors.push(fetched.error);
      if (fetched.status === 429 || fetched.status === 403) return;
    } else {
      try {
        const result = await persistDeck(admin, fetched.deck, source);
        if (result === "unchanged") summary.unchanged += 1;
        else summary.insertedOrUpdated += 1;
        await markSourceSuccess(admin, source.source_key);
        await admin
          .from("external_deck_ingest_queue")
          .update({
            status: result === "unchanged" ? "skipped" : "done",
            processed_at: new Date().toISOString(),
            last_error: null,
            last_error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", q.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "persist_failed";
        summary.failed += 1;
        summary.errors.push(msg);
        await admin
          .from("external_deck_ingest_queue")
          .update({
            status: "failed",
            attempts: (q.attempts ?? 0) + 1,
            last_error: msg.slice(0, 500),
            last_error_code: "persist_failed",
            next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", q.id);
      }
    }
    await politeDelay(source.min_delay_ms);
  }
}

export async function writeExternalMetaRollups(admin: SupabaseClient): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const { data: decks } = await admin
    .from("external_decks")
    .select("id, source_key, format, commanders, aggregate_approved")
    .eq("aggregate_approved", true);
  const deckRows = (decks ?? []) as Array<{ id: string; source_key: string; format: string | null; commanders: string[]; aggregate_approved: boolean }>;
  if (deckRows.length === 0) return 0;
  const deckIds = deckRows.map((d) => d.id);
  const { data: cards } = await admin
    .from("external_deck_cards")
    .select("external_deck_id, source_key, card_name, card_name_norm, board")
    .in("external_deck_id", deckIds)
    .in("board", ["mainboard", "commander"]);

  const payload = new Map<string, { source_key: string; format: string; entity_type: "commander" | "card"; entity_name: string; entity_name_norm: string; deckIds: Set<string>; sources: Record<string, number> }>();
  const add = (sourceKey: string, format: string, type: "commander" | "card", name: string, deckId: string) => {
    const norm = normalizeScryfallCacheName(name);
    if (!norm) return;
    const key = `${sourceKey}|${format}|${type}|${norm}`;
    const existing = payload.get(key) ?? {
      source_key: sourceKey,
      format,
      entity_type: type,
      entity_name: name,
      entity_name_norm: norm,
      deckIds: new Set<string>(),
      sources: {},
    };
    if (!existing.deckIds.has(deckId)) {
      existing.deckIds.add(deckId);
      existing.sources[sourceKey] = (existing.sources[sourceKey] ?? 0) + 1;
    }
    payload.set(key, existing);
  };

  for (const d of deckRows) {
    const format = d.format ?? "unknown";
    for (const c of d.commanders ?? []) add(d.source_key, format, "commander", c, d.id);
  }
  for (const c of cards ?? []) {
    const row = c as { external_deck_id: string; source_key: string; card_name: string; card_name_norm?: string | null };
    const deck = deckRows.find((d) => d.id === row.external_deck_id);
    if (!deck) continue;
    add(row.source_key, deck.format ?? "unknown", "card", row.card_name, row.external_deck_id);
  }

  const rows = [...payload.values()].map((r) => ({
    snapshot_date: snapshotDate,
    source_key: r.source_key,
    format: r.format,
    entity_type: r.entity_type,
    entity_name: r.entity_name,
    entity_name_norm: r.entity_name_norm,
    deck_count: r.deckIds.size,
    source_breakdown: r.sources,
    sample_deck_ids: [...r.deckIds].slice(0, 50),
    payload: {},
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("external_meta_rollups_daily").upsert(rows.slice(i, i + 500), {
      onConflict: "snapshot_date,source_key,format,entity_type,entity_name_norm",
    });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

function categoryHits(name: string, facts: { type_line?: string | null; oracle_text?: string | null } | undefined) {
  const lower = `${name} ${facts?.type_line ?? ""} ${facts?.oracle_text ?? ""}`.toLowerCase();
  return {
    land: /\bland\b/.test(String(facts?.type_line ?? "").toLowerCase()),
    ramp: /(add .*mana|search your library.*land|treasure token|arcane signet|sol ring|mana rock|cultivate|kodama's reach|farseek|nature's lore)/i.test(lower),
    draw: /(draw (a|two|three|x|that many) cards?|whenever .* draw|rhystic study|esper sentinel)/i.test(lower),
    removal: /(destroy target|exile target|counter target|return target|deals .* damage to target|swords to plowshares|path to exile)/i.test(lower),
    protection: /(hexproof|indestructible|protection from|phase out|prevent all damage|heroic intervention|teferi's protection|lightning greaves|swiftfoot boots)/i.test(lower),
  };
}

export async function writeExternalCommanderProfiles(admin: SupabaseClient): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const { data: decksRaw } = await admin
    .from("external_decks")
    .select("id, source_key, format, commanders, is_valid, aggregate_approved, exclusion_reason")
    .eq("format", "commander");
  const decks = (decksRaw ?? []) as Array<{
    id: string;
    source_key: string;
    format: string | null;
    commanders: string[];
    is_valid: boolean;
    aggregate_approved: boolean;
    exclusion_reason: ExclusionReason | null;
  }>;
  if (decks.length === 0) return 0;
  const cardsRaw = await admin
    .from("external_deck_cards")
    .select("external_deck_id, card_name, card_name_norm, quantity, board")
    .in("external_deck_id", decks.map((d) => d.id))
    .in("board", ["mainboard", "commander"]);
  const cards = (cardsRaw.data ?? []) as Array<{ external_deck_id: string; card_name: string; card_name_norm: string | null; quantity: number; board: string }>;
  const facts = await fetchCardFacts(admin, cards.map((c) => c.card_name));
  const cardsByDeck = new Map<string, typeof cards>();
  for (const c of cards) cardsByDeck.set(c.external_deck_id, [...(cardsByDeck.get(c.external_deck_id) ?? []), c]);

  const commanderKeys = new Map<string, string>();
  for (const d of decks) {
    for (const c of d.commanders ?? []) {
      const norm = normalizeScryfallCacheName(c);
      if (norm && !commanderKeys.has(norm)) commanderKeys.set(norm, c);
    }
  }

  const rows = [];
  for (const [commanderNorm, commanderName] of commanderKeys.entries()) {
    const related = decks.filter((d) => (d.commanders ?? []).some((c) => normalizeScryfallCacheName(c) === commanderNorm));
    const rawSample = related.length;
    const approved = related.filter((d) => d.aggregate_approved);
    const exclusionReasons: Record<string, number> = {};
    for (const d of related.filter((row) => !row.aggregate_approved)) {
      const reason = d.exclusion_reason ?? (d.is_valid ? "unsupported_source" : "parse_failure");
      exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
    }
    const sourceBreakdown: Record<string, number> = {};
    const cardDeckCounts = new Map<string, { name: string; count: number }>();
    const totals = { lands: 0, ramp: 0, draw: 0, removal: 0, protection: 0, mv: 0, mvCards: 0 };
    const curve: Record<string, number> = {};
    for (const d of approved) {
      sourceBreakdown[d.source_key] = (sourceBreakdown[d.source_key] ?? 0) + 1;
      const seen = new Set<string>();
      const deckCards = cardsByDeck.get(d.id) ?? [];
      const local = { lands: 0, ramp: 0, draw: 0, removal: 0, protection: 0, mv: 0, mvCards: 0 };
      for (const c of deckCards) {
        const norm = c.card_name_norm ?? normalizeScryfallCacheName(c.card_name);
        if (norm === commanderNorm) continue;
        const fact = facts.get(norm);
        const qty = Math.max(1, Number(c.quantity) || 1);
        if (!seen.has(norm)) {
          seen.add(norm);
          const entry = cardDeckCounts.get(norm) ?? { name: c.card_name, count: 0 };
          entry.count += 1;
          cardDeckCounts.set(norm, entry);
        }
        const hits = categoryHits(c.card_name, fact);
        if (hits.land) local.lands += qty;
        if (hits.ramp) local.ramp += qty;
        if (hits.draw) local.draw += qty;
        if (hits.removal) local.removal += qty;
        if (hits.protection) local.protection += qty;
        const cmc = Number(fact?.cmc ?? 0);
        if (Number.isFinite(cmc) && cmc > 0 && !hits.land) {
          local.mv += cmc * qty;
          local.mvCards += qty;
          const bucket = cmc >= 7 ? "7+" : String(Math.floor(cmc));
          curve[bucket] = (curve[bucket] ?? 0) + qty;
        }
      }
      totals.lands += local.lands;
      totals.ramp += local.ramp;
      totals.draw += local.draw;
      totals.removal += local.removal;
      totals.protection += local.protection;
      totals.mv += local.mv;
      totals.mvCards += local.mvCards;
    }
    const approvedCount = approved.length;
    const commonCards = [...cardDeckCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 40)
      .map((c) => ({ name: c.name, deck_count: c.count, inclusion_rate: approvedCount ? Number((c.count / approvedCount).toFixed(3)) : 0 }));
    const presentNorms = new Set(commonCards.map((c) => normalizeScryfallCacheName(c.name)));
    const missingCommonSupport = SUPPORT_CARDS.filter((name) => !presentNorms.has(normalizeScryfallCacheName(name))).map((name) => ({ name }));
    const confidence = Math.min(1, Math.max(0, approvedCount / 100) * 0.7 + Math.min(0.3, Object.keys(sourceBreakdown).length * 0.1));
    rows.push({
      commander_name: commanderName,
      commander_name_norm: commanderNorm,
      snapshot_date: snapshotDate,
      raw_sample_size: rawSample,
      approved_sample_size: approvedCount,
      excluded_count: Math.max(0, rawSample - approvedCount),
      exclusion_reasons: exclusionReasons,
      source_breakdown: sourceBreakdown,
      common_cards: commonCards,
      missing_common_support: missingCommonSupport,
      averages: {
        lands: approvedCount ? Number((totals.lands / approvedCount).toFixed(1)) : 0,
        ramp: approvedCount ? Number((totals.ramp / approvedCount).toFixed(1)) : 0,
        draw: approvedCount ? Number((totals.draw / approvedCount).toFixed(1)) : 0,
        removal: approvedCount ? Number((totals.removal / approvedCount).toFixed(1)) : 0,
        protection: approvedCount ? Number((totals.protection / approvedCount).toFixed(1)) : 0,
        average_mv: totals.mvCards ? Number((totals.mv / totals.mvCards).toFixed(2)) : 0,
      },
      curve_summary: curve,
      confidence_score: Number(confidence.toFixed(3)),
      attribution: {
        claim_sample_size: approvedCount,
        source_breakdown: sourceBreakdown,
        copy: `Based on ${approvedCount} public ${commanderName} decks from approved external sources.`,
      },
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin.from("external_commander_profiles").upsert(rows.slice(i, i + 100), {
      onConflict: "commander_name_norm,snapshot_date",
    });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export async function runExternalDeckMetaIngest(
  admin: SupabaseClient,
  opts?: { source?: ExternalDeckSourceKey | "all"; limit?: number; discover?: boolean }
): Promise<ExternalDeckIngestSummary> {
  const summary = emptySummary();
  const sourceFilter = opts?.source && opts.source !== "all" ? opts.source : null;
  if (opts?.discover !== false) {
    const { data: archidekt } = await admin
      .from("external_deck_sources")
      .select("source_key, enabled, discovery_enabled, cooldown_until")
      .eq("source_key", "archidekt")
      .maybeSingle();
    const source = archidekt as { enabled?: boolean; discovery_enabled?: boolean; cooldown_until?: string | null } | null;
    if (!sourceFilter && source?.enabled && source.discovery_enabled && !isSourceCoolingDown({ cooldown_until: source.cooldown_until ?? null })) {
      try {
        summary.discovered = await discoverArchidektQueue(admin);
      } catch (e) {
        summary.errors.push(e instanceof Error ? e.message : "archidekt_discovery_failed");
      }
    }
  }

  let sourceQuery = admin
    .from("external_deck_sources")
    .select("source_key, display_name, enabled, discovery_enabled, approved_for_profiles, cooldown_until, min_delay_ms, max_decks_per_run, max_discovery_pages_per_run, consecutive_failures, last_error")
    .eq("enabled", true);
  if (sourceFilter) sourceQuery = sourceQuery.eq("source_key", sourceFilter);
  const { data: sourceData, error } = await sourceQuery;
  if (error) throw new Error(error.message);

  for (const source of sourceRows(sourceData)) {
    const capped = opts?.limit ? { ...source, max_decks_per_run: Math.min(source.max_decks_per_run, opts.limit) } : source;
    await processQueueForSource(admin, capped, summary);
  }

  summary.rollupsWritten = await writeExternalMetaRollups(admin);
  summary.profilesWritten = await writeExternalCommanderProfiles(admin);
  return summary;
}

export async function getExternalDeckMetaStatus(admin: SupabaseClient) {
  const [sources, queuePending, decks, profiles, latestRollups] = await Promise.all([
    admin
      .from("external_deck_sources")
      .select("source_key, display_name, enabled, discovery_enabled, cooldown_until, last_fetched_at, last_success_at, last_error, consecutive_failures, max_decks_per_run"),
    admin.from("external_deck_ingest_queue").select("id, status", { count: "exact" }),
    admin.from("external_decks").select("id, source_key, format, is_valid, aggregate_approved", { count: "exact" }),
    admin
      .from("external_commander_profiles")
      .select("id, commander_name, raw_sample_size, approved_sample_size, excluded_count, exclusion_reasons, source_breakdown, confidence_score, approved_for_public, attribution, last_refreshed_at")
      .order("last_refreshed_at", { ascending: false })
      .limit(50),
    admin
      .from("external_meta_rollups_daily")
      .select("snapshot_date, entity_type, deck_count")
      .order("snapshot_date", { ascending: false })
      .limit(10),
  ]);
  if (sources.error) throw new Error(sources.error.message);
  if (queuePending.error) throw new Error(queuePending.error.message);
  if (decks.error) throw new Error(decks.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  return {
    sources: sources.data ?? [],
    queue_total: queuePending.count ?? 0,
    queue_by_status: (queuePending.data ?? []).reduce((acc: Record<string, number>, row: { status?: string }) => {
      const key = row.status ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    decks_total: decks.count ?? 0,
    decks_by_state: (decks.data ?? []).reduce((acc: Record<string, number>, row: { source_key?: string; format?: string; is_valid?: boolean; aggregate_approved?: boolean }) => {
      const key = `${row.source_key ?? "unknown"}:${row.format ?? "unknown"}:${row.aggregate_approved ? "approved" : row.is_valid ? "valid" : "excluded"}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    profiles: profiles.data ?? [],
    latest_rollups: latestRollups.data ?? [],
  };
}

export async function setExternalCommanderProfileApproval(
  admin: SupabaseClient,
  profileId: string,
  approved: boolean,
  userId: string
) {
  const { data, error } = await admin
    .from("external_commander_profiles")
    .update({
      approved_for_public: approved,
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select("id, commander_name, approved_for_public")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
