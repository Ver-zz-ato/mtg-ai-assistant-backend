import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_CATALOG, routeRiskRank } from "@/lib/admin/route-catalog";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "forbidden" | "error" | "missing_env" | "slow" | "skipped";

function classify(status: number, ms: number, body: string): CheckStatus {
  if (status === 401 || status === 403 || status === 404) return "forbidden";
  if (/missing_service_role|missing.*env|not configured|admin_client_unavailable/i.test(body)) return "missing_env";
  if (status >= 500) return "error";
  if (ms > 2000) return "slow";
  return "ok";
}

async function probe(req: NextRequest, path: string) {
  const origin = req.nextUrl.origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${origin}${path}`, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    const ms = Date.now() - t0;
    return {
      path,
      status: classify(res.status, ms, text),
      httpStatus: res.status,
      ms,
      detail: text.slice(0, 240),
    };
  } catch (error: any) {
    return {
      path,
      status: "error" as CheckStatus,
      httpStatus: 0,
      ms: Date.now() - t0,
      detail: error?.name === "AbortError" ? "Timed out after 8s" : error?.message || "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const url = new URL(req.url);
  const runChecks = url.searchParams.get("check") === "1";
  const routes = ADMIN_ROUTE_CATALOG.slice().sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat) return cat;
    return routeRiskRank(b.risk) - routeRiskRank(a.risk) || a.path.localeCompare(b.path);
  });

  const checks = [];
  if (runChecks) {
    const safeRoutes = routes.filter((route) => route.healthCheck === "safe-get" && route.methods.includes("GET"));
    for (const route of safeRoutes) {
      checks.push(await probe(req, route.path));
    }
    for (const route of routes.filter((route) => route.healthCheck !== "safe-get")) {
      checks.push({
        path: route.path,
        status: "skipped" as CheckStatus,
        httpStatus: null,
        ms: 0,
        detail: route.healthCheck === "skip-write" ? "Skipped: write route" : "Skipped: dynamic route",
      });
    }
  }

  const summary = {
    totalRoutes: routes.length,
    writeRoutes: routes.filter((route) => route.writes).length,
    criticalRoutes: routes.filter((route) => route.risk === "critical").length,
    safeChecks: checks.filter((check) => check.status !== "skipped").length,
    ok: checks.filter((check) => check.status === "ok").length,
    slow: checks.filter((check) => check.status === "slow").length,
    forbidden: checks.filter((check) => check.status === "forbidden").length,
    errors: checks.filter((check) => check.status === "error" || check.status === "missing_env").length,
  };

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      routes,
      checks,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
