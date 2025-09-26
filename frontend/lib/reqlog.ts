export async function withReqLog(req: Request, userId: string | null, handler: () => Promise<Response>) {
  const start = Date.now();
  let status = 500;
  try {
    const res = await handler();
    status = res.status;
    return res;
  } finally {
    const ms = Date.now() - start;
    console.log(`[api] ${req.method} ${new URL(req.url).pathname} ${status} ${ms}ms uid=${userId ?? "anon"}`);
  }
}
