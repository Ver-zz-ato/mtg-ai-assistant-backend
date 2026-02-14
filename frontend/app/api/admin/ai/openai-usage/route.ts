/**
 * Fetches actual usage and costs from OpenAI's Usage API and Costs API.
 * Requires OPENAI_ADMIN_API_KEY (Admin API key from org settings).
 * See: https://platform.openai.com/settings/organization/admin-keys
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

const USAGE_URL = 'https://api.openai.com/v1/organization/usage/completions';
const COSTS_URL = 'https://api.openai.com/v1/organization/costs';

async function fetchPaginated(
  url: string,
  adminKey: string,
  params: Record<string, string | number | undefined>
): Promise<unknown[]> {
  const allData: unknown[] = [];
  let pageCursor: string | undefined;
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') searchParams.set(k, String(v));
  }
  do {
    if (pageCursor) searchParams.set('page', pageCursor);
    const res = await fetch(`${url}?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${err}`);
    }
    const json = (await res.json()) as { data?: unknown[]; next_page?: string };
    const data = json.data ?? [];
    allData.push(...data);
    pageCursor = json.next_page ?? undefined;
  } while (pageCursor);
  return allData;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const adminKey = process.env.OPENAI_ADMIN_API_KEY;
    if (!adminKey) {
      return NextResponse.json({
        ok: false,
        error: 'OPENAI_ADMIN_API_KEY not set. Add your Admin API key from https://platform.openai.com/settings/organization/admin-keys',
      }, { status: 500 });
    }

    const sp = req.nextUrl.searchParams;
    const days = Math.min(90, Math.max(1, parseInt(sp.get('days') || '7', 10) || 7));
    const startTime = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    const [usageBuckets, costsBuckets] = await Promise.all([
      fetchPaginated(USAGE_URL, adminKey, {
        start_time: startTime,
        bucket_width: '1d',
        limit: days,
        group_by: 'model',
      }) as Promise<Array<{ start_time: number; end_time: number; results: Array<{
        input_tokens: number;
        output_tokens: number;
        num_model_requests: number;
        model: string | null;
        input_cached_tokens?: number;
      }> }>>,
      fetchPaginated(COSTS_URL, adminKey, {
        start_time: startTime,
        bucket_width: '1d',
        limit: days,
      }) as Promise<Array<{ start_time: number; end_time: number; results: Array<{
        amount: { value: number; currency: string };
      }> }>>,
    ]);

    // Aggregate usage
    const byModel = new Map<string, { input_tokens: number; output_tokens: number; requests: number }>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalRequests = 0;
    const dailyUsage: Array<{ date: string; input_tokens: number; output_tokens: number; requests: number }> = [];

    for (const bucket of usageBuckets) {
      let dayInput = 0;
      let dayOutput = 0;
      let dayRequests = 0;
      for (const r of bucket.results ?? []) {
        const model = r.model ?? 'unknown';
        const entry = byModel.get(model) ?? { input_tokens: 0, output_tokens: 0, requests: 0 };
        entry.input_tokens += r.input_tokens ?? 0;
        entry.output_tokens += r.output_tokens ?? 0;
        entry.requests += r.num_model_requests ?? 0;
        byModel.set(model, entry);
        dayInput += r.input_tokens ?? 0;
        dayOutput += r.output_tokens ?? 0;
        dayRequests += r.num_model_requests ?? 0;
        totalInput += r.input_tokens ?? 0;
        totalOutput += r.output_tokens ?? 0;
        totalRequests += r.num_model_requests ?? 0;
      }
      dailyUsage.push({
        date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
        input_tokens: dayInput,
        output_tokens: dayOutput,
        requests: dayRequests,
      });
    }

    // Aggregate costs
    let totalCostUsd = 0;
    const dailyCosts: Array<{ date: string; cost_usd: number }> = [];
    for (const bucket of costsBuckets) {
      let bucketCost = 0;
      for (const r of bucket.results ?? []) {
        const val = r.amount?.value ?? 0;
        bucketCost += val;
        totalCostUsd += val;
      }
      dailyCosts.push({
        date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
        cost_usd: Math.round(bucketCost * 10000) / 10000,
      });
    }

    return NextResponse.json({
      ok: true,
      source: 'openai_api',
      days,
      totals: {
        cost_usd: Math.round(totalCostUsd * 10000) / 10000,
        input_tokens: totalInput,
        output_tokens: totalOutput,
        requests: totalRequests,
      },
      by_model: Array.from(byModel.entries()).map(([model, v]) => ({
        model,
        ...v,
      })).sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)),
      daily_usage: dailyUsage.sort((a, b) => a.date.localeCompare(b.date)),
      daily_costs: dailyCosts.sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
