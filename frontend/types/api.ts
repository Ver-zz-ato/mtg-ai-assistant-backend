/** Standard API response envelope for ManaTap routes. */

export type ApiSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type ApiError = {
  ok: false;
  error: string;
  code?: string;
  csrf_error?: boolean;
  limit?: number;
  resetAt?: string;
};

export type ApiResponse<T extends Record<string, unknown> = Record<string, never>> =
  | ApiSuccess<T>
  | ApiError;

export function isApiError(res: ApiResponse): res is ApiError {
  return res.ok === false;
}
