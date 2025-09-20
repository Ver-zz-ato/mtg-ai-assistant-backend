export function ok<T>(data: T) {
  return Response.json({ ok: true, ...data } as any);
}
export function err(message: string, status = 400) {
  return Response.json({ ok: false, error: { message } }, { status });
}
