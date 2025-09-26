// Minimal timing logger (server-side usage only)
export async function withTiming<T>(
  route: string,
  method: string,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(JSON.stringify({ tag: "chat_api_timing", route, method, status: "ok", ms, userId }));
    return { result, ms };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(JSON.stringify({ tag: "chat_api_timing", route, method, status: "error", ms, userId, error: (e as Error).message }));
    throw e;
  }
}
