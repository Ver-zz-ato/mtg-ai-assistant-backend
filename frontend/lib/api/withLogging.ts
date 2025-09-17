// lib/api/withLogging.ts
import type { NextRequest } from "next/server";

type Handler = (req: NextRequest) => Promise<Response> | Response;

export function withLogging(handler: Handler, label?: string): Handler {
  return async (req: NextRequest) => {
    const start = Date.now();
    const url = new URL(req.url);
    try {
      const res = await handler(req);
      const ms = Date.now() - start;
      console.log(`[api] ${req.method} ${url.pathname}${url.search} ${res.status} ${ms}ms ${label ?? ""}`.trim());
      return res;
    } catch (e: any) {
      const ms = Date.now() - start;
      console.error(`[api] ${req.method} ${url.pathname}${url.search} threw after ${ms}ms`, e?.message || e);
      throw e;
    }
  };
}
