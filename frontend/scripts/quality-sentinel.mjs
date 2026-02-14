#!/usr/bin/env node
/**
 * Quality Sentinel: per-route metrics from ai_usage with guardrail thresholds.
 * Run: node scripts/quality-sentinel.mjs [days=7] [--json]
 * With Supabase keys: runs. Without: skips with warning (exit 0, CI-friendly).
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
for (const envPath of [
  path.join(projectRoot, ".env.local"),
  path.join(__dirname, "../.env.local"),
  ".env.local",
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const VALUE_MOMENT_ROUTES = [
  "deck_analyze",
  "deck_analyze_slot_planning",
  "deck_analyze_slot_candidates",
  "swap_suggestions",
  "swap_why",
  "suggestion_why",
  "deck_scan",
  "deck_compare",
];

const DECK_CONTEXT_CHAT_ROUTES = ["chat", "chat_stream"];
const TRUNC_THRESHOLD = Number(process.env.QUALITY_TRUNC_THRESHOLD) || 2;
const RETRY_BASELINE_PCT = Number(process.env.QUALITY_RETRY_BASELINE_PCT) || 50;
const FULL_LLM_MIN_RATE = Number(process.env.QUALITY_FULL_LLM_MIN_RATE) || 70;
const AVG_OUT_DROP_PCT = Number(process.env.QUALITY_AVG_OUT_DROP_PCT) || 25;

const argv = process.argv.slice(2);
const jsonMode = argv.includes("--json");
const daysArg = argv.find((a) => !a.startsWith("--") && /^\d+$/.test(a));
const days = Math.min(90, Math.max(1, parseInt(daysArg || "7", 10) || 7));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  const msg =
    "Quality Sentinel SKIPPED: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.";
  if (jsonMode) {
    console.log(JSON.stringify({ skipped: true, reason: msg }));
  } else {
    console.warn(msg);
  }
  process.exit(0);
}

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const priorCutoff = new Date(Date.now() - (days + 7) * 24 * 60 * 60 * 1000).toISOString();

function p95(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(0.95 * s.length)] ?? null;
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const selectCols =
    "id,created_at,route,model,input_tokens,output_tokens,user_id,layer0_mode,request_kind,cache_hit,response_truncated,error_code,latency_ms,prompt_tier,has_deck_context";

  const { data: rows, error } = await supabase
    .from("ai_usage")
    .select(selectCols)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) {
    if (jsonMode) {
      console.log(JSON.stringify({ skipped: true, reason: error.message }));
    } else {
      console.error("Failed to fetch ai_usage:", error.message);
    }
    process.exit(jsonMode ? 0 : 1);
  }

  // Prior period for baseline / WoW
  let priorRows = [];
  try {
    const { data } = await supabase
      .from("ai_usage")
      .select("id,route,output_tokens,user_id,created_at")
      .gte("created_at", priorCutoff)
      .lt("created_at", cutoff);
    priorRows = data || [];
  } catch {
    // ignore
  }

  const byRoute = new Map();
  const byTier = new Map();
  const truncatedSampleIds = new Map(); // route -> [ids]

  for (const r of rows || []) {
    const route = r.route || "unknown";
    const tier = r.prompt_tier || "unknown";
    const kind = r.request_kind || r.layer0_mode || "unknown";

    if (!byRoute.has(route)) {
      byRoute.set(route, {
        requests: 0,
        output_tokens: [],
        no_llm: 0,
        mini_only: 0,
        full_llm: 0,
        cache_hit: 0,
        truncated: 0,
        err_429: 0,
        latencies: [],
        with_deck_context: 0,
        full_llm_with_deck: 0,
      });
    }
    const br = byRoute.get(route);
    br.requests += 1;
    if (r.output_tokens != null) br.output_tokens.push(Number(r.output_tokens));
    if (kind === "NO_LLM") br.no_llm += 1;
    else if (kind === "MINI_ONLY") br.mini_only += 1;
    else br.full_llm += 1;
    if (r.cache_hit === true) br.cache_hit += 1;
    if (r.response_truncated === true) {
      br.truncated += 1;
      if (VALUE_MOMENT_ROUTES.includes(route)) {
        if (!truncatedSampleIds.has(route)) truncatedSampleIds.set(route, []);
        if (truncatedSampleIds.get(route).length < 5) {
          truncatedSampleIds.get(route).push(r.id);
        }
      }
    }
    if (r.error_code === "429_budget" || (r.error_code && String(r.error_code).includes("429")))
      br.err_429 += 1;
    if (r.latency_ms != null) br.latencies.push(Number(r.latency_ms));
    if (r.has_deck_context === true && DECK_CONTEXT_CHAT_ROUTES.includes(route)) {
      br.with_deck_context += 1;
      if (kind === "FULL_LLM") br.full_llm_with_deck += 1;
    }

    if (!byTier.has(tier)) {
      byTier.set(tier, {
        requests: 0,
        output_tokens: [],
        truncated: 0,
      });
    }
    const bt = byTier.get(tier);
    bt.requests += 1;
    if (r.output_tokens != null) bt.output_tokens.push(Number(r.output_tokens));
    if (r.response_truncated === true) bt.truncated += 1;
  }

  // Retries: same user+route within 2 min
  const retriesByRoute = new Map();
  const seen = new Map();
  for (const r of rows || []) {
    const route = r.route || "unknown";
    const key = `${r.user_id || "anon"}|${route}`;
    const t = new Date(r.created_at).getTime();
    const last = seen.get(key);
    if (last != null && t - last < 2 * 60 * 1000) {
      retriesByRoute.set(route, (retriesByRoute.get(route) || 0) + 1);
    }
    seen.set(key, t);
  }

  // Prior period retries
  const priorRetriesByRoute = new Map();
  const priorSeen = new Map();
  for (const r of priorRows) {
    const route = r.route || "unknown";
    const key = `${r.user_id || "anon"}|${route}`;
    const t = new Date(r.created_at).getTime();
    const last = priorSeen.get(key);
    if (last != null && t - last < 2 * 60 * 1000) {
      priorRetriesByRoute.set(route, (priorRetriesByRoute.get(route) || 0) + 1);
    }
    priorSeen.set(key, t);
  }

  // Prior period avg output by route
  const priorAvgByRoute = new Map();
  for (const r of priorRows) {
    const route = r.route || "unknown";
    if (!priorAvgByRoute.has(route)) priorAvgByRoute.set(route, []);
    if (r.output_tokens != null) priorAvgByRoute.get(route).push(Number(r.output_tokens));
  }

  const warnings = [];

  // Guardrail: truncation rate on value-moment routes
  for (const route of VALUE_MOMENT_ROUTES) {
    const br = byRoute.get(route);
    if (!br || br.requests === 0) continue;
    const truncPct = (br.truncated / br.requests) * 100;
    if (truncPct > TRUNC_THRESHOLD) {
      warnings.push({
        type: "truncation_rate",
        route,
        rate: truncPct.toFixed(1),
        threshold: TRUNC_THRESHOLD,
        requests: br.requests,
        truncated: br.truncated,
        sampleIds: (truncatedSampleIds.get(route) || []).slice(0, 5),
      });
    }
  }

  // Guardrail: retries > baseline + 50%
  for (const [route, retries] of retriesByRoute) {
    if (retries === 0) continue;
    const priorRetries = priorRetriesByRoute.get(route) || 0;
    const baseline = priorRetries;
    const threshold = baseline + (baseline * RETRY_BASELINE_PCT) / 100;
    if (retries > threshold && priorRows.length > 0) {
      warnings.push({
        type: "retry_spike",
        route,
        current: retries,
        baseline,
        threshold: Math.ceil(threshold),
      });
    } else if (retries > 5 && priorRows.length === 0) {
      warnings.push({
        type: "retry_warn",
        route,
        retries,
        note: "No prior data for baseline comparison",
      });
    }
  }

  // Guardrail: FULL_LLM rate on deck-context chats
  let deckContextTotal = 0;
  let deckContextFull = 0;
  for (const route of DECK_CONTEXT_CHAT_ROUTES) {
    const br = byRoute.get(route);
    if (!br) continue;
    deckContextTotal += br.with_deck_context || 0;
    deckContextFull += br.full_llm_with_deck || 0;
  }
  if (deckContextTotal > 10) {
    const fullPct = (deckContextFull / deckContextTotal) * 100;
    if (fullPct < FULL_LLM_MIN_RATE) {
      warnings.push({
        type: "full_llm_deck_context",
        fullPct: fullPct.toFixed(1),
        threshold: FULL_LLM_MIN_RATE,
        total: deckContextTotal,
        fullCount: deckContextFull,
      });
    }
  }

  // Guardrail: avg output tokens WoW drop on deck_analyze / swap_suggestions
  for (const route of ["deck_analyze", "swap_suggestions"]) {
    const br = byRoute.get(route);
    const priorToks = priorAvgByRoute.get(route) || [];
    if (!br || br.output_tokens.length < 5 || priorToks.length < 5) continue;
    const currAvg =
      br.output_tokens.reduce((a, b) => a + b, 0) / br.output_tokens.length;
    const priorAvg = priorToks.reduce((a, b) => a + b, 0) / priorToks.length;
    if (priorAvg > 0) {
      const dropPct = ((priorAvg - currAvg) / priorAvg) * 100;
      if (dropPct > AVG_OUT_DROP_PCT) {
        warnings.push({
          type: "avg_output_drop",
          route,
          currAvg: currAvg.toFixed(0),
          priorAvg: priorAvg.toFixed(0),
          dropPct: dropPct.toFixed(1),
          threshold: AVG_OUT_DROP_PCT,
        });
      }
    }
  }

  const routeRows = Array.from(byRoute.entries())
    .map(([route, v]) => ({
      route,
      requests: v.requests,
      avg_out: v.output_tokens.length
        ? (v.output_tokens.reduce((a, b) => a + b, 0) / v.output_tokens.length).toFixed(0)
        : "-",
      no_llm_pct: ((v.no_llm / v.requests) * 100).toFixed(1),
      mini_pct: ((v.mini_only / v.requests) * 100).toFixed(1),
      full_pct: ((v.full_llm / v.requests) * 100).toFixed(1),
      cache_pct: ((v.cache_hit / v.requests) * 100).toFixed(1),
      trunc_pct: ((v.truncated / v.requests) * 100).toFixed(1),
      err429_pct: ((v.err_429 / v.requests) * 100).toFixed(1),
      p95_lat: p95(v.latencies),
      retries: retriesByRoute.get(route) || 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  const tierRows = Array.from(byTier.entries())
    .map(([tier, v]) => ({
      tier,
      requests: v.requests,
      avg_out: v.output_tokens.length
        ? (v.output_tokens.reduce((a, b) => a + b, 0) / v.output_tokens.length).toFixed(0)
        : "-",
      trunc_pct: ((v.truncated / v.requests) * 100).toFixed(1),
    }))
    .sort((a, b) => b.requests - a.requests);

  const result = {
    skipped: false,
    totalRequests: rows?.length || 0,
    days,
    byRoute: routeRows,
    byTier: tierRows,
    warnings,
  };

  if (jsonMode) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`=== Quality Sentinel (last ${days} days) ===\n`);
    console.log(`Total requests: ${rows?.length || 0}\n`);
    if (warnings.length > 0) {
      console.log("--- Warnings ---");
      warnings.forEach((w) => console.log(JSON.stringify(w)));
      console.log("");
    }
    console.log("--- By route ---");
    console.log(
      "route".padEnd(28) +
        "req".padStart(6) +
        "avgOut".padStart(8) +
        "NO_LLM%".padStart(8) +
        "MINI%".padStart(7) +
        "FULL%".padStart(7) +
        "cache%".padStart(8) +
        "trunc%".padStart(8) +
        "429%".padStart(6) +
        "p95ms".padStart(8) +
        "retry".padStart(7)
    );
    for (const r of routeRows) {
      console.log(
        r.route.padEnd(28).slice(0, 28) +
          String(r.requests).padStart(6) +
          String(r.avg_out).padStart(8) +
          (r.no_llm_pct + "%").padStart(8) +
          (r.mini_pct + "%").padStart(7) +
          (r.full_pct + "%").padStart(7) +
          (r.cache_pct + "%").padStart(8) +
          (r.trunc_pct + "%").padStart(8) +
          (r.err429_pct + "%").padStart(6) +
          (r.p95_lat != null ? String(r.p95_lat) : "-").padStart(8) +
          String(r.retries).padStart(7)
      );
    }
    console.log("\n--- By prompt_tier ---");
    for (const t of tierRows) {
      console.log(
        `  ${t.tier}: ${t.requests} req, avg_out=${t.avg_out}, trunc=${t.trunc_pct}%`
      );
    }
  }
}

main().catch((e) => {
  if (jsonMode) {
    console.log(JSON.stringify({ skipped: true, reason: String(e) }));
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});
