export const ok = <T extends Record<string, any>>(data: T, init?: ResponseInit) => {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    ...(init || {}),
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
};
export const err = (message: string, code = "server_error", status = 400) => {
  return new Response(JSON.stringify({ ok: false, error: { message, code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
};
