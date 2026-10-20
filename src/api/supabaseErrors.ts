// The one place where Postgres / PostgREST / Auth / Storage / Functions errors become ApiErrors (docs/CONTRACT.md).
import { apiError, isApiError } from './errors';
import type { ApiError, ApiErrorCode } from './types';

const UNKNOWN_MESSAGE = 'Something went wrong.';

// SQLSTATE and PostgREST codes (PostgrestError.code) plus supabase-js Auth error codes (AuthError.code).
const CODE_MAP: Readonly<Record<string, ApiErrorCode>> = {
  '42501': 'forbidden',
  '23505': 'conflict',
  '23502': 'validation',
  '23503': 'validation',
  '23514': 'validation',
  '22001': 'validation',
  '22003': 'validation',
  '22007': 'validation',
  '22008': 'validation',
  '22P02': 'validation',
  PGRST116: 'not_found',
  PGRST301: 'unauthenticated',
  PGRST303: 'unauthenticated',
  invalid_credentials: 'unauthenticated',
  session_not_found: 'unauthenticated',
  session_expired: 'unauthenticated',
  refresh_token_not_found: 'unauthenticated',
  bad_jwt: 'unauthenticated',
  no_authorization: 'unauthenticated',
  user_banned: 'forbidden',
  user_not_found: 'not_found',
  email_exists: 'conflict',
  user_already_exists: 'conflict',
  weak_password: 'validation',
  same_password: 'validation',
  validation_failed: 'validation',
};

const STATUS_MAP: Readonly<Record<number, ApiErrorCode>> = {
  400: 'validation',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'validation',
  415: 'validation',
  422: 'validation',
};

const NETWORK_ERROR_NAMES: ReadonlySet<string> = new Set(['AuthRetryableFetchError', 'FunctionsFetchError']);
const NETWORK_MESSAGE_PARTS: readonly string[] = ['failed to fetch', 'fetch failed', 'networkerror', 'network request failed', 'load failed'];
const SESSION_MISSING_NAMES: ReadonlySet<string> = new Set(['AuthSessionMissingError']);

type Fields = Record<string, unknown>;

function fieldsOf(error: unknown): Fields {
  return typeof error === 'object' && error !== null ? (error as Fields) : {};
}

function messageOf(fields: Fields): string {
  return typeof fields.message === 'string' && fields.message !== '' ? fields.message : UNKNOWN_MESSAGE;
}

function toStatus(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return undefined;
}

/** HTTP status of the failed request: Auth/Storage put it on the error, Functions on the Response in `context`. */
function statusOf(fields: Fields): number | undefined {
  const contextStatus = toStatus(fieldsOf(fields.context).status);
  return toStatus(fields.status) ?? toStatus(fields.statusCode) ?? contextStatus;
}

function isNetworkFailure(fields: Fields, message: string): boolean {
  if (typeof fields.name === 'string' && NETWORK_ERROR_NAMES.has(fields.name)) return true;
  const lower = message.toLowerCase();
  return NETWORK_MESSAGE_PARTS.some((part) => lower.includes(part));
}

function classify(fields: Fields, message: string): ApiErrorCode {
  if (message.toLowerCase().includes('template_limit')) return 'template_limit';
  if (isNetworkFailure(fields, message)) return 'network';
  if (typeof fields.code === 'string' && Object.hasOwn(CODE_MAP, fields.code)) return CODE_MAP[fields.code];
  if (typeof fields.name === 'string' && SESSION_MISSING_NAMES.has(fields.name)) return 'unauthenticated';
  const status = statusOf(fields);
  return status !== undefined && Object.hasOwn(STATUS_MAP, status) ? STATUS_MAP[status] : 'unknown';
}

/** Maps anything thrown or returned as `error` by supabase-js to an ApiError. Never exposes the raw error object. */
export function mapError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  const fields = fieldsOf(error);
  const message = messageOf(fields);
  return apiError(classify(fields, message), message);
}
