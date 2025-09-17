import { NextResponse } from "next/server";
export type Ok<T=unknown> = { ok: true } & T;
export type Err = { ok: false; error: string; detail?: unknown };
export function ok<T=Record<string, unknown>>(data?: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...(data as any) } as Ok<T>, init);
}
export function err(message: string, detail?: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: false, error: message, ...(detail ? { detail } : {}) } as Err, init);
}
