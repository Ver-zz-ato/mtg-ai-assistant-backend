// Minimal result helper used by server routes. Safe to import anywhere.
export function result<T>(ok: boolean, extra?: T) {
  return { ok, ...(extra as any) };
}
