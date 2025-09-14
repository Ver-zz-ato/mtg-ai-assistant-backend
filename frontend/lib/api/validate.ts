// lib/api/validate.ts
export type FieldSpec =
  | { type: "string"; optional?: boolean; min?: number; max?: number }
  | { type: "number"; optional?: boolean; min?: number; max?: number }
  | { type: "boolean"; optional?: boolean };

export type Schema = Record<string, FieldSpec>;

export function validate(data: any, schema: Schema): { ok: true; value: any } | { ok: false; error: string } {
  const out: any = {};
  for (const [key, spec] of Object.entries(schema)) {
    const v = (data as any)[key];
    if (v === undefined || v === null) {
      if ((spec as any).optional) continue;
      return { ok: false, error: `Missing field: ${key}` };
    }
    switch (spec.type) {
      case "string": {
        if (typeof v !== "string") return { ok: false, error: `Field ${key} must be a string` };
        const len = v.length;
        if (spec.min !== undefined && len < spec.min) return { ok: false, error: `Field ${key} too short` };
        if (spec.max !== undefined && len > spec.max) return { ok: false, error: `Field ${key} too long` };
        out[key] = v;
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return { ok: false, error: `Field ${key} must be a number` };
        if (spec.min !== undefined && n < spec.min) return { ok: false, error: `Field ${key} too small` };
        if (spec.max !== undefined && n > spec.max) return { ok: false, error: `Field ${key} too large` };
        out[key] = n;
        break;
      }
      case "boolean": {
        if (typeof v !== "boolean") return { ok: false, error: `Field ${key} must be a boolean` };
        out[key] = v;
        break;
      }
    }
  }
  return { ok: true, value: out };
}

export async function readJSON(req: Request): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  return {};
}
