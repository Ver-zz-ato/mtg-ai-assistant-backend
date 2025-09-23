export async function logRequest(req: Request, status: number, startedAt: number, userId?: string | null) {
  try {
    const ms = Date.now() - startedAt;
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;
    // eslint-disable-next-line no-console
    console.log(`[api] ${method} ${path} ${status} ${ms}ms${userId ? ` user=${userId}` : ''}`);
  } catch {}
}
