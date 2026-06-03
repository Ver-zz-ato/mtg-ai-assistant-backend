const USAGE_URL = "https://api.openai.com/v1/organization/usage/completions";
const COSTS_URL = "https://api.openai.com/v1/organization/costs";

type ParamValue = string | number | boolean | Array<string | number> | undefined;

type OpenAiUsageBucket = {
  start_time: number;
  end_time: number;
  start_time_iso?: string;
  end_time_iso?: string;
  results?: Array<{
    model?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    input_cached_tokens?: number;
    num_model_requests?: number;
  }>;
};

type OpenAiCostsBucket = {
  start_time: number;
  end_time: number;
  start_time_iso?: string;
  end_time_iso?: string;
  results?: Array<{
    amount?: { value?: number | string; currency?: string };
    api_key_id?: string | null;
    project_id?: string | null;
    project_name?: string | null;
  }>;
};

export type OpenAiOrgSpendSnapshot = {
  source: "openai_api";
  cost_source: "openai_api";
  window: {
    start_time: number;
    end_time: number;
    start_iso: string;
    end_iso: string;
  };
  filters: {
    project_ids: string[];
    api_key_ids: string[];
  };
  totals: {
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    requests: number;
  };
  projects: Array<{
    project_id: string | null;
    project_name: string | null;
    cost_usd: number;
  }>;
  api_keys: Array<{
    api_key_id: string | null;
    cost_usd: number;
  }>;
  by_model: Array<{
    model: string;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    requests: number;
  }>;
  daily_usage: Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    requests: number;
  }>;
  daily_costs: Array<{
    date: string;
    cost_usd: number;
    projects: Array<{
      project_id: string | null;
      project_name: string | null;
      cost_usd: number;
    }>;
  }>;
  latest_completed_day: {
    date: string;
    cost_usd: number;
  } | null;
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function parseMoney(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function normalizeProjectIds(input: string | string[] | undefined | null): string[] {
  const list = Array.isArray(input) ? input : [input];
  return list
    .flatMap((value) => String(value || "").split(/[,\s]+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function getConfiguredProjectIds(): string[] {
  return normalizeProjectIds(
    process.env.OPENAI_USAGE_PROJECT_IDS ||
    process.env.OPENAI_PROJECT_IDS ||
    process.env.OPENAI_PROJECT_ID,
  );
}

function getConfiguredApiKeyIds(): string[] {
  return normalizeProjectIds(
    process.env.OPENAI_USAGE_API_KEY_IDS ||
    process.env.OPENAI_API_KEY_IDS ||
    process.env.OPENAI_API_KEY_ID,
  );
}

function buildSearchParams(params: Record<string, ParamValue>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") searchParams.append(key, String(item));
      }
      continue;
    }
    searchParams.set(key, String(value));
  }
  return searchParams;
}

async function fetchPaginated<T>(
  url: string,
  adminKey: string,
  params: Record<string, ParamValue>,
): Promise<T[]> {
  const allData: T[] = [];
  let pageCursor: string | undefined;
  const searchParams = buildSearchParams(params);
  do {
    if (pageCursor) searchParams.set("page", pageCursor);
    const res = await fetch(`${url}?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${err}`);
    }
    const json = await res.json() as { data?: T[]; next_page?: string | null };
    allData.push(...(json.data || []));
    pageCursor = json.next_page || undefined;
  } while (pageCursor);
  return allData;
}

function getStartOfTodayUtcEpoch(now = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
}

export function getMonthStartUtcEpoch(now = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

export async function fetchOpenAiOrgSpendSnapshot(options?: {
  days?: number;
  startTime?: number;
  endTime?: number;
  projectIds?: string[];
  apiKeyIds?: string[];
}): Promise<OpenAiOrgSpendSnapshot> {
  const adminKey = process.env.OPENAI_ADMIN_API_KEY;
  if (!adminKey) {
    throw new Error("OPENAI_ADMIN_API_KEY not set.");
  }

  const endTime = options?.endTime ?? Math.floor(Date.now() / 1000);
  const startTime = options?.startTime ?? (endTime - (Math.max(1, options?.days ?? 7) * 24 * 60 * 60));
  const projectIds = normalizeProjectIds(options?.projectIds).length > 0
    ? normalizeProjectIds(options?.projectIds)
    : getConfiguredProjectIds();
  const apiKeyIds = normalizeProjectIds(options?.apiKeyIds).length > 0
    ? normalizeProjectIds(options?.apiKeyIds)
    : getConfiguredApiKeyIds();
  const bucketDays = Math.max(1, Math.min(180, Math.ceil((endTime - startTime) / (24 * 60 * 60))));

  const usageParams: Record<string, ParamValue> = {
    start_time: startTime,
    end_time: endTime,
    bucket_width: "1d",
    limit: bucketDays,
    group_by: "model",
  };
  const costsParams: Record<string, ParamValue> = {
    start_time: startTime,
    end_time: endTime,
    bucket_width: "1d",
    limit: bucketDays,
    group_by: apiKeyIds.length > 0 ? "api_key_id" : "project_id",
  };
  if (projectIds.length > 0) {
    usageParams.project_ids = projectIds;
    costsParams.project_ids = projectIds;
  }
  if (apiKeyIds.length > 0) {
    usageParams.api_key_ids = apiKeyIds;
    costsParams.api_key_ids = apiKeyIds;
  }

  const [usageBuckets, costsBuckets] = await Promise.all([
    fetchPaginated<OpenAiUsageBucket>(USAGE_URL, adminKey, usageParams),
    fetchPaginated<OpenAiCostsBucket>(COSTS_URL, adminKey, costsParams),
  ]);

  const byModel = new Map<string, { input_tokens: number; output_tokens: number; cached_input_tokens: number; requests: number }>();
  const projectCostMap = new Map<string, { project_id: string | null; project_name: string | null; cost_usd: number }>();
  const apiKeyCostMap = new Map<string, { api_key_id: string | null; cost_usd: number }>();
  const dailyUsage: OpenAiOrgSpendSnapshot["daily_usage"] = [];
  const dailyCosts: OpenAiOrgSpendSnapshot["daily_costs"] = [];

  let totalInput = 0;
  let totalOutput = 0;
  let totalCachedInput = 0;
  let totalRequests = 0;

  for (const bucket of usageBuckets) {
    let dayInput = 0;
    let dayOutput = 0;
    let dayCachedInput = 0;
    let dayRequests = 0;
    for (const result of bucket.results || []) {
      const model = String(result.model || "unknown");
      const cached = Number(result.input_cached_tokens) || 0;
      const entry = byModel.get(model) || { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, requests: 0 };
      entry.input_tokens += Number(result.input_tokens) || 0;
      entry.output_tokens += Number(result.output_tokens) || 0;
      entry.cached_input_tokens += cached;
      entry.requests += Number(result.num_model_requests) || 0;
      byModel.set(model, entry);
      dayInput += Number(result.input_tokens) || 0;
      dayOutput += Number(result.output_tokens) || 0;
      dayCachedInput += cached;
      dayRequests += Number(result.num_model_requests) || 0;
    }
    totalInput += dayInput;
    totalOutput += dayOutput;
    totalCachedInput += dayCachedInput;
    totalRequests += dayRequests;
    dailyUsage.push({
      date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
      input_tokens: dayInput,
      output_tokens: dayOutput,
      cached_input_tokens: dayCachedInput,
      requests: dayRequests,
    });
  }

  let totalCostUsd = 0;
  for (const bucket of costsBuckets) {
    let bucketCost = 0;
    const bucketProjects: Array<{ project_id: string | null; project_name: string | null; cost_usd: number }> = [];
    for (const result of bucket.results || []) {
      const amount = parseMoney(result.amount?.value);
      bucketCost += amount;
      totalCostUsd += amount;
      const projectId = result.project_id ?? null;
      const projectName = result.project_name ?? null;
      const projectKey = projectId || projectName || "unknown";
      const projectEntry = projectCostMap.get(projectKey) || { project_id: projectId, project_name: projectName, cost_usd: 0 };
      projectEntry.cost_usd += amount;
      projectCostMap.set(projectKey, projectEntry);
      const apiKeyId = result.api_key_id ?? null;
      if (apiKeyId || apiKeyIds.length > 0) {
        const apiKey = apiKeyId || "unknown";
        const apiKeyEntry = apiKeyCostMap.get(apiKey) || { api_key_id: apiKeyId, cost_usd: 0 };
        apiKeyEntry.cost_usd += amount;
        apiKeyCostMap.set(apiKey, apiKeyEntry);
      }
      bucketProjects.push({
        project_id: projectId,
        project_name: projectName,
        cost_usd: round(amount),
      });
    }
    dailyCosts.push({
      date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
      cost_usd: round(bucketCost),
      projects: bucketProjects,
    });
  }

  const latestCompletedCutoff = getStartOfTodayUtcEpoch();
  const latestCompletedDay = dailyCosts
    .filter((bucket, index) => {
      const rawBucket = costsBuckets[index];
      return rawBucket?.end_time != null && rawBucket.end_time <= latestCompletedCutoff;
    })
    .slice(-1)[0] || null;

  return {
    source: "openai_api",
    cost_source: "openai_api",
    window: {
      start_time: startTime,
      end_time: endTime,
      start_iso: new Date(startTime * 1000).toISOString(),
      end_iso: new Date(endTime * 1000).toISOString(),
    },
    filters: {
      project_ids: projectIds,
      api_key_ids: apiKeyIds,
    },
    totals: {
      cost_usd: round(totalCostUsd),
      input_tokens: totalInput,
      output_tokens: totalOutput,
      cached_input_tokens: totalCachedInput,
      requests: totalRequests,
    },
    projects: Array.from(projectCostMap.values())
      .map((project) => ({ ...project, cost_usd: round(project.cost_usd) }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
    api_keys: Array.from(apiKeyCostMap.values())
      .map((apiKey) => ({ ...apiKey, cost_usd: round(apiKey.cost_usd) }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
    by_model: Array.from(byModel.entries())
      .map(([model, value]) => ({ model, ...value }))
      .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)),
    daily_usage: dailyUsage.sort((a, b) => a.date.localeCompare(b.date)),
    daily_costs: dailyCosts.sort((a, b) => a.date.localeCompare(b.date)),
    latest_completed_day: latestCompletedDay ? {
      date: latestCompletedDay.date,
      cost_usd: latestCompletedDay.cost_usd,
    } : null,
  };
}
