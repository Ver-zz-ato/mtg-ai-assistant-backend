// lib/api/withLogging.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Handler = (req: Request, ctx?: any) => Promise<Response>;

export function withLogging(handler: Handler): Handler {
  return async (req, ctx) => {
    const t0 = Date.now();
    let userId = "anon";
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id ?? "anon";
    } catch {}
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (e: any) {
      const ms = Date.now() - t0;
      console.error(JSON.stringify({
        level: "error",
        msg: e?.message || "Unhandled error",
        method: req.method,
        path: new URL(req.url).pathname,
        ms,
        userId
      }));
      return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
    }
    const ms = Date.now() - t0;
    const status = (res as any)?.status ?? 200;
    console.log(JSON.stringify({
      level: "info",
      method: req.method,
      path: new URL(req.url).pathname,
      status,
      ms,
      userId
    }));
    return res;
  };
}
