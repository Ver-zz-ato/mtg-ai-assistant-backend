// Shared envelope helpers used by API routes and client
export type ErrorEnvelope = {
  ok: false;
  error: { code?: string; message: string; hint?: string };
};

export type OkEnvelope<T = {}> = { ok: true } & T;

export type Envelope<T = {}> = OkEnvelope<T> | ErrorEnvelope;

export function ok<T extends {}>(data: T = {} as T): OkEnvelope<T> {
  return { ok: true, ...(data as any) };
}

export function err(message: string, code?: string, hint?: string): ErrorEnvelope {
  return { ok: false, error: { code, message, hint } };
}
