import type { ApiError, ApiResponse } from '@/types/api';

export class ApiClientError extends Error {
  status: number;
  payload: ApiError;

  constructor(status: number, payload: ApiError) {
    super(payload.error || `Request failed (${status})`);
    this.status = status;
    this.payload = payload;
  }
}

/** Typed fetch wrapper: checks HTTP status and `{ ok }` envelope. */
export async function parseApiResponse<T extends Record<string, unknown>>(
  res: Response,
): Promise<Extract<ApiResponse<T>, { ok: true }>> {
  const json = (await res.json().catch(() => ({ ok: false, error: 'Invalid JSON' }))) as ApiResponse<T>;
  if (!res.ok || json.ok === false) {
    throw new ApiClientError(res.status, {
      ok: false,
      error: (json as ApiError).error || res.statusText || 'Request failed',
      code: (json as ApiError).code,
      csrf_error: (json as ApiError).csrf_error,
    });
  }
  return json;
}
