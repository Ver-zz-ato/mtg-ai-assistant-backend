/**
 * Standard API error and success response utilities
 * Ensures consistent error format across all API routes
 */

import { NextResponse } from 'next/server';

export interface ApiErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export interface ApiSuccessResponse<T = any> {
  ok: true;
  [key: string]: any;
}

/**
 * Create a standard error response
 * @param message - Human-readable error message
 * @param code - Machine-readable error code (optional)
 * @param status - HTTP status code (default: 500)
 */
export function apiError(
  message: string,
  code?: string,
  status: number = 500
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(code && { code }),
    },
    { status }
  );
}

/**
 * Create a standard success response
 * @param data - Response data (will be spread into response object)
 * @param status - HTTP status code (default: 200)
 */
export function apiSuccess<T extends Record<string, any>>(
  data: T,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    { status }
  );
}



