export const ok = <T extends Record<string, any>>(data: T, init?: ResponseInit) => {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    ...(init || {}),
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
};
export const err = (message: string, code = "server_error", status = 400, metadata?: Record<string, any>) => {
  const response: any = { ok: false, code, error: message };
  if (metadata) {
    Object.assign(response, metadata);
  }
  return new Response(JSON.stringify(response), {
    status,
    headers: { "content-type": "application/json" },
  });
};
