import { getAdmin } from "@/app/api/_lib/supa";

export type BadgeCategory = "onboarding" | "deckbuilding" | "tools" | "collection" | "prestige";

export type CanonicalBadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  category: BadgeCategory;
  metricKey: string;
  targetValue: number;
  sortOrder: number;
  isActive: boolean;
  isHidden: boolean;
};

export type CanonicalBadgeProgress = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  current: number;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  source: string;
};

type BadgeMetricKey =
  | "analysis_count"
  | "budget_swap_count"
  | "chat_message_count"
  | "collection_card_count"
  | "custom_card_count"
  | "deck_count"
  | "mulligan_iteration_count"
  | "probability_run_count"
  | "pro_upgrade_ever"
  | "roast_count";

type BadgeMetricMap = Record<BadgeMetricKey, number>;

const SYNC_SOURCE = "profile_badge_sync";
const CHAT_THREAD_CHUNK = 120;
const COLLECTION_ID_CHUNK = 200;

const FALLBACK_DEFINITIONS: CanonicalBadgeDefinition[] = [
  {
    id: "first_deck",
    name: "First Deck",
    description: "Create your first deck",
    icon: "🃏",
    category: "onboarding",
    metricKey: "deck_count",
    targetValue: 1,
    sortOrder: 10,
    isActive: true,
    isHidden: false,
  },
  {
    id: "deck_collector",
    name: "Deck Collector",
    description: "Own 10 or more decks",
    icon: "📚",
    category: "deckbuilding",
    metricKey: "deck_count",
    targetValue: 10,
    sortOrder: 20,
    isActive: true,
    isHidden: false,
  },
  {
    id: "deck_hoarder",
    name: "Deck Hoarder",
    description: "Own 50 or more decks",
    icon: "🏰",
    category: "deckbuilding",
    metricKey: "deck_count",
    targetValue: 50,
    sortOrder: 30,
    isActive: true,
    isHidden: false,
  },
  {
    id: "deck_lord",
    name: "Deck Lord",
    description: "Own 100 or more decks",
    icon: "👑",
    category: "prestige",
    metricKey: "deck_count",
    targetValue: 100,
    sortOrder: 40,
    isActive: true,
    isHidden: false,
  },
  {
    id: "chatterbox",
    name: "Chatterbox",
    description: "Send 10 chat messages",
    icon: "💬",
    category: "onboarding",
    metricKey: "chat_message_count",
    targetValue: 10,
    sortOrder: 50,
    isActive: true,
    isHidden: false,
  },
  {
    id: "analyst",
    name: "Analyst",
    description: "Run deck analysis 5 times",
    icon: "🧠",
    category: "tools",
    metricKey: "analysis_count",
    targetValue: 5,
    sortOrder: 60,
    isActive: true,
    isHidden: false,
  },
  {
    id: "mathlete",
    name: "Mathlete",
    description: "Use Probability Calculator 10 times",
    icon: "🧮",
    category: "tools",
    metricKey: "probability_run_count",
    targetValue: 10,
    sortOrder: 70,
    isActive: true,
    isHidden: false,
  },
  {
    id: "mulligan_master",
    name: "Mulligan Master",
    description: "Run 25,000 mulligan iterations",
    icon: "🎲",
    category: "tools",
    metricKey: "mulligan_iteration_count",
    targetValue: 25000,
    sortOrder: 80,
    isActive: true,
    isHidden: false,
  },
  {
    id: "budget_brain",
    name: "Budget Brain",
    description: "Run Budget Swaps 5 times",
    icon: "💰",
    category: "tools",
    metricKey: "budget_swap_count",
    targetValue: 5,
    sortOrder: 90,
    isActive: true,
    isHidden: false,
  },
  {
    id: "card_collector",
    name: "Card Collector",
    description: "Add 100 cards to your collection",
    icon: "📦",
    category: "collection",
    metricKey: "collection_card_count",
    targetValue: 100,
    sortOrder: 100,
    isActive: true,
    isHidden: false,
  },
  {
    id: "curator",
    name: "Curator",
    description: "Add 500 cards to your collection",
    icon: "🗂️",
    category: "collection",
    metricKey: "collection_card_count",
    targetValue: 500,
    sortOrder: 110,
    isActive: true,
    isHidden: false,
  },
  {
    id: "roasted",
    name: "Roasted",
    description: "Generate your first deck roast",
    icon: "🔥",
    category: "tools",
    metricKey: "roast_count",
    targetValue: 1,
    sortOrder: 120,
    isActive: true,
    isHidden: false,
  },
  {
    id: "customizer",
    name: "Customizer",
    description: "Create your first custom card",
    icon: "🎨",
    category: "tools",
    metricKey: "custom_card_count",
    targetValue: 1,
    sortOrder: 130,
    isActive: true,
    isHidden: false,
  },
  {
    id: "pro_tactician",
    name: "Pro Tactician",
    description: "Unlock Pro once",
    icon: "⭐",
    category: "prestige",
    metricKey: "pro_upgrade_ever",
    targetValue: 1,
    sortOrder: 140,
    isActive: true,
    isHidden: false,
  },
];

export async function syncUserBadgeState(userId: string): Promise<{
  definitions: CanonicalBadgeDefinition[];
  progress: CanonicalBadgeProgress[];
  earnedNames: string[];
}> {
  const admin = getAdmin();
  if (!admin) {
    throw new Error("missing_service_role_key");
  }

  const [definitions, metrics, existingUnlocks] = await Promise.all([
    loadBadgeDefinitions(admin),
    collectBadgeMetrics(admin, userId),
    loadExistingUnlocks(admin, userId),
  ]);

  const existingById = new Map(existingUnlocks.map((row) => [row.badge_id, row]));
  const nowIso = new Date().toISOString();

  const unlockedRows = [];
  const progressRows = [];
  const progress: CanonicalBadgeProgress[] = [];

  for (const def of definitions) {
    const current = metrics[def.metricKey as BadgeMetricKey] ?? 0;
    const target = def.targetValue;
    const existing = existingById.get(def.id);
    const newlyUnlocked = current >= target;
    const unlocked = Boolean(existing) || newlyUnlocked;
    const unlockedAt = existing?.unlocked_at ?? (newlyUnlocked ? nowIso : null);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

    if (unlocked) {
      unlockedRows.push({
        user_id: userId,
        badge_id: def.id,
        unlocked_at: unlockedAt ?? nowIso,
        metric_value: current,
        source: SYNC_SOURCE,
        metadata: { metric_key: def.metricKey },
        updated_at: nowIso,
      });
    }

    progressRows.push({
      user_id: userId,
      badge_id: def.id,
      current_value: current,
      target_value: target,
      unlocked,
      unlocked_at: unlockedAt,
      source: SYNC_SOURCE,
      metadata: { metric_key: def.metricKey },
      updated_at: nowIso,
    });

    progress.push({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon ?? "🏆",
      category: def.category,
      current,
      target,
      progress: pct,
      unlocked,
      unlockedAt,
      source: SYNC_SOURCE,
    });
  }

  if (unlockedRows.length > 0) {
    const { error } = await admin.from("user_badges").upsert(unlockedRows);
    if (error) throw new Error(error.message);
  }

  if (progressRows.length > 0) {
    const { error } = await admin.from("user_badge_progress").upsert(progressRows);
    if (error) throw new Error(error.message);
  }

  const sorted = sortBadgeProgress(progress);
  return {
    definitions,
    progress: sorted,
    earnedNames: sorted.filter((row) => row.unlocked).map((row) => row.name),
  };
}

export function getClosestLockedBadges(rows: CanonicalBadgeProgress[], limit = 3): CanonicalBadgeProgress[] {
  return rows
    .filter((row) => !row.unlocked)
    .sort((a, b) => {
      if (b.progress !== a.progress) return b.progress - a.progress;
      return a.target - b.target;
    })
    .slice(0, limit);
}

async function loadBadgeDefinitions(admin: NonNullable<ReturnType<typeof getAdmin>>): Promise<CanonicalBadgeDefinition[]> {
  const { data, error } = await admin
    .from("badge_definitions")
    .select("id, name, description, icon, category, metric_key, target_value, sort_order, is_active, is_hidden")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return FALLBACK_DEFINITIONS;
  }

  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    icon: row.icon ? String(row.icon) : null,
    category: String(row.category) as BadgeCategory,
    metricKey: String(row.metric_key),
    targetValue: Number(row.target_value || 0),
    sortOrder: Number(row.sort_order || 0),
    isActive: row.is_active !== false,
    isHidden: row.is_hidden === true,
  }));
}

async function loadExistingUnlocks(admin: NonNullable<ReturnType<typeof getAdmin>>, userId: string) {
  const { data, error } = await admin
    .from("user_badges")
    .select("badge_id, unlocked_at")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

async function collectBadgeMetrics(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  userId: string,
): Promise<BadgeMetricMap> {
  const [
    deckCount,
    analysisCount,
    roastCount,
    budgetSwapCount,
    customCardCount,
    profileRow,
    authUser,
    chatMessageCount,
    collectionCardCount,
  ] = await Promise.all([
    countRows(admin.from("decks").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    countRows(
      admin
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("route", "deck_analyze")
        .gt("input_tokens", 0),
    ),
    countRows(
      admin
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("route", ["deck_roast", "deck_roast_mobile"])
        .gt("input_tokens", 0),
    ),
    countRows(admin.from("budget_swap_analytics").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    countRows(admin.from("custom_cards").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    selectMaybeSingle<{ pro_since?: string | null }>(
      admin.from("profiles").select("pro_since").eq("id", userId).maybeSingle(),
    ),
    admin.auth.admin.getUserById(userId),
    countUserChatMessages(admin, userId),
    sumUserCollectionCards(admin, userId),
  ]);

  const tools = ((authUser.data?.user?.user_metadata as { tools?: Record<string, unknown> } | undefined)?.tools ?? {}) as Record<string, unknown>;
  const probabilityRuns = asInt(tools.prob_runs);
  const mulliganIterations = asInt(tools.mull_iters_total);
  const proUpgradeEver = profileRow?.pro_since ? 1 : 0;

  return {
    analysis_count: analysisCount,
    budget_swap_count: budgetSwapCount,
    chat_message_count: chatMessageCount,
    collection_card_count: collectionCardCount,
    custom_card_count: customCardCount,
    deck_count: deckCount,
    mulligan_iteration_count: mulliganIterations,
    probability_run_count: probabilityRuns,
    pro_upgrade_ever: proUpgradeEver,
    roast_count: roastCount,
  };
}

async function countUserChatMessages(admin: NonNullable<ReturnType<typeof getAdmin>>, userId: string): Promise<number> {
  const { data: threads, error } = await admin.from("chat_threads").select("id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = Array.isArray(threads) ? threads.map((row) => String(row.id)) : [];
  if (ids.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < ids.length; i += CHAT_THREAD_CHUNK) {
    const slice = ids.slice(i, i + CHAT_THREAD_CHUNK);
    const count = await countRows(
      admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", slice)
        .eq("role", "user"),
    );
    total += count;
  }
  return total;
}

async function sumUserCollectionCards(admin: NonNullable<ReturnType<typeof getAdmin>>, userId: string): Promise<number> {
  const { data: collections, error } = await admin.from("collections").select("id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = Array.isArray(collections) ? collections.map((row) => String(row.id)) : [];
  if (ids.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < ids.length; i += COLLECTION_ID_CHUNK) {
    const slice = ids.slice(i, i + COLLECTION_ID_CHUNK);
    const { data: cards, error: cardError } = await admin
      .from("collection_cards")
      .select("qty")
      .in("collection_id", slice);
    if (cardError) throw new Error(cardError.message);
    total += (cards ?? []).reduce((sum, row) => sum + Math.max(0, asInt((row as { qty?: unknown }).qty)), 0);
  }
  return total;
}

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

async function selectMaybeSingle<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? null;
}

function asInt(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function sortBadgeProgress(rows: CanonicalBadgeProgress[]): CanonicalBadgeProgress[] {
  return [...rows].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return a.target - b.target;
  });
}
