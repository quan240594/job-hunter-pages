import type { ApiErrorCode } from '../api';

const CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation',
  'template_limit',
  'conflict',
  'network',
  'unknown',
]);

export type ErrorTexts = Partial<Record<ApiErrorCode, string>>;

const DEFAULT_TEXTS: Record<ApiErrorCode, string> = {
  unauthenticated: 'Your session has expired. Please sign in again.',
  forbidden: 'You are not allowed to do that.',
  not_found: 'That item no longer exists. Refresh the page and try again.',
  validation: 'Some of the values are not valid. Check them and try again.',
  template_limit: 'You reached a limit. Remove something and try again.',
  conflict: 'That already exists.',
  network: 'Cannot reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Anything thrown by the api becomes one of the contract's codes; other failures count as 'unknown'. */
export function errorCode(thrown: unknown): ApiErrorCode {
  if (typeof thrown === 'object' && thrown !== null && 'code' in thrown) {
    const { code } = thrown;
    if (typeof code === 'string' && CODES.has(code)) return code as ApiErrorCode;
  }
  return 'unknown';
}

/**
 * The one place that turns a thrown ApiError into text for people. Raw server messages are never shown (they can be
 * technical); callers pass per-screen wording for the codes that need it.
 */
export function describeError(thrown: unknown, overrides: ErrorTexts = {}): string {
  const code = errorCode(thrown);
  return overrides[code] ?? DEFAULT_TEXTS[code];
}
