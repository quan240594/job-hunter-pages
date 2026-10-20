import type { ApiError, ApiErrorCode } from './types';

const API_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation',
  'template_limit',
  'conflict',
  'network',
  'unknown',
]);

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { code, message };
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.has(value);
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return isApiErrorCode(candidate.code) && typeof candidate.message === 'string';
}
