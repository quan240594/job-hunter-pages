// Business logic of the admin-users Edge Function (docs/CONTRACT.md, section 4). Pure and dependency-injected so it runs
// unchanged in Deno (the platform) and in Node (Vitest): no Deno globals, only type imports from supabase-js.
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AdminAction, AdminResponse, AdminUser, FunctionErrorCode, Role } from './contract.ts';

type AuthAdmin = SupabaseClient['auth']['admin'];

/** The slice of the service-role Supabase client the function uses (the real client is assignable to it). */
export interface AdminClient {
  auth: {
    getUser: SupabaseClient['auth']['getUser'];
    admin: Pick<
      AuthAdmin,
      'listUsers' | 'getUserById' | 'createUser' | 'inviteUserByEmail' | 'updateUserById' | 'deleteUser'
    >;
  };
  storage: {
    from: (bucket: string) => Pick<ReturnType<SupabaseClient['storage']['from']>, 'list' | 'remove'>;
  };
}

export interface HandlerDeps {
  admin: AdminClient;
  now: () => number;
  allowedOrigins: readonly string[];
  /** Receives a short, secret-free description of unexpected failures. */
  logError: (message: string) => void;
}

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://quan240594.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export const MIN_PASSWORD_LENGTH = 12;

const MAX_PASSWORD_LENGTH = 72;
const MAX_BODY_LENGTH = 4096;
const MAX_TOKEN_LENGTH = 8192;
const MAX_EMAIL_LENGTH = 254;
const PAGE_SIZE = 1000;
const STORAGE_PAGE_SIZE = 100;
const BUCKET = 'documents';
const BAN_FOREVER = '876000h';
const BAN_NONE = 'none';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const CONFLICT_CODES = new Set(['email_exists', 'user_already_exists']);
const VALIDATION_CODES = new Set(['weak_password', 'email_address_invalid', 'validation_failed']);

const STATUS: Record<FunctionErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  unknown: 500,
};

class FunctionFailure extends Error {
  readonly code: FunctionErrorCode;

  constructor(code: FunctionErrorCode, message: string) {
    super(message);
    this.name = 'FunctionFailure';
    this.code = code;
  }
}

function fail(code: FunctionErrorCode, message: string): never {
  throw new FunctionFailure(code, message);
}

interface ErrorLike {
  message: string;
  code?: string;
}

function toFailure(error: ErrorLike): FunctionFailure {
  if (error.code !== undefined && CONFLICT_CODES.has(error.code)) {
    return new FunctionFailure('conflict', 'A user with this email already exists');
  }
  if (error.code === 'user_not_found') {
    return new FunctionFailure('not_found', 'User not found');
  }
  if (error.code !== undefined && VALIDATION_CODES.has(error.code)) {
    return new FunctionFailure('validation', error.message);
  }
  return new FunctionFailure('unknown', 'The request could not be completed');
}

function unwrap<R extends { data: unknown; error: ErrorLike | null }>(result: R): Extract<R, { error: null }>['data'] {
  if (result.error) {
    throw toFailure(result.error);
  }
  return result.data as Extract<R, { error: null }>['data'];
}

function requireUser(user: User | null): User {
  return user ?? fail('not_found', 'User not found');
}

// ------------------------------------------------------------------ users

function roleOf(user: User): Role {
  return user.app_metadata.role === 'admin' ? 'admin' : 'user';
}

function isBanned(user: User, now: number): boolean {
  return Date.parse(user.banned_until ?? '') > now;
}

function toAdminUser(user: User, now: number): AdminUser {
  return {
    id: user.id,
    email: user.email ?? '',
    role: roleOf(user),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
    banned: isBanned(user, now),
  };
}

async function fetchAllUsers(deps: HandlerDeps): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  let batch: User[];
  do {
    batch = unwrap(await deps.admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })).users;
    users.push(...batch);
    page += 1;
  } while (batch.length === PAGE_SIZE);
  return users;
}

async function loadTarget(deps: HandlerDeps, id: string): Promise<User> {
  return requireUser(unwrap(await deps.admin.auth.admin.getUserById(id)).user);
}

async function assertNotLastAdmin(deps: HandlerDeps, target: User): Promise<void> {
  const now = deps.now();
  if (roleOf(target) !== 'admin' || isBanned(target, now)) {
    return;
  }
  const others = (await fetchAllUsers(deps)).filter(
    (user) => user.id !== target.id && roleOf(user) === 'admin' && !isBanned(user, now),
  );
  if (others.length === 0) {
    fail('forbidden', 'The last admin cannot be removed');
  }
}

// ------------------------------------------------------------------ authentication

function bearerToken(header: string | null): string | undefined {
  const [scheme, token, ...rest] = (header ?? '').trim().split(' ');
  const valid = scheme.toLowerCase() === 'bearer' && rest.length === 0 && token !== undefined;
  return valid && token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : undefined;
}

/** Verifies the JWT with the Auth server, then re-reads the user record so demotions and bans apply immediately. */
async function authenticate(deps: HandlerDeps, request: Request): Promise<User> {
  const token = bearerToken(request.headers.get('authorization'));
  if (token === undefined) {
    fail('unauthenticated', 'Missing bearer token');
  }
  const verified = await deps.admin.auth.getUser(token);
  if (verified.error || !verified.data.user) {
    fail('unauthenticated', 'Invalid or expired token');
  }
  const record = await deps.admin.auth.admin.getUserById(verified.data.user.id);
  if (record.error || !record.data.user) {
    fail('unauthenticated', 'Unknown user');
  }
  if (isBanned(record.data.user, deps.now())) {
    fail('forbidden', 'This account is disabled');
  }
  return record.data.user;
}

// ------------------------------------------------------------------ request validation

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBody(text: string): Record<string, unknown> {
  if (text.length > MAX_BODY_LENGTH) {
    fail('validation', 'Request body is too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('validation', 'Request body must be valid JSON');
  }
  return isRecord(parsed) ? parsed : fail('validation', 'Request body must be a JSON object');
}

function parseId(value: unknown): string {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : fail('validation', 'id must be a UUID');
}

function parseRole(value: unknown): Role {
  return value === 'admin' || value === 'user' ? value : fail('validation', "role must be 'admin' or 'user'");
}

function parseEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const at = email.indexOf('@');
  const domain = email.slice(at + 1);
  const valid =
    email.length <= MAX_EMAIL_LENGTH &&
    at > 0 &&
    at === email.lastIndexOf('@') &&
    !/\s/.test(email) &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..');
  return valid ? email : fail('validation', 'email must be a valid email address');
}

function parseTempPassword(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const valid = typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH;
  return valid ? value : fail('validation', `tempPassword must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`);
}

function parseAction(body: Record<string, unknown>): AdminAction {
  switch (body.action) {
    case 'listUsers':
    case 'deleteSelf':
      return { action: body.action };
    case 'createUser':
      return {
        action: 'createUser',
        email: parseEmail(body.email),
        tempPassword: parseTempPassword(body.tempPassword),
        role: parseRole(body.role),
      };
    case 'setRole':
      return { action: 'setRole', id: parseId(body.id), role: parseRole(body.role) };
    case 'setBanned':
      return typeof body.banned === 'boolean'
        ? { action: 'setBanned', id: parseId(body.id), banned: body.banned }
        : fail('validation', 'banned must be a boolean');
    case 'deleteUser':
      return { action: 'deleteUser', id: parseId(body.id) };
    default:
      return fail('validation', 'Unknown action');
  }
}

// ------------------------------------------------------------------ actions

async function listUsers(deps: HandlerDeps): Promise<AdminUser[]> {
  const users = await fetchAllUsers(deps);
  return users
    .map((user) => toAdminUser(user, deps.now()))
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

async function inviteUser(deps: HandlerDeps, email: string, role: Role): Promise<AdminUser> {
  const { auth } = deps.admin;
  const invited = requireUser(
    unwrap(await auth.admin.inviteUserByEmail(email, { data: { must_change_password: true } })).user,
  );
  const updated = await auth.admin.updateUserById(invited.id, { app_metadata: { role } });
  if (updated.error || !updated.data.user) {
    // Do not leave a half-created account behind: it would block a retry with "already exists".
    await auth.admin.deleteUser(invited.id);
    throw updated.error ? toFailure(updated.error) : new FunctionFailure('unknown', 'The invitation failed');
  }
  return toAdminUser(updated.data.user, deps.now());
}

async function createUser(
  deps: HandlerDeps,
  input: { email: string; tempPassword?: string; role: Role },
): Promise<AdminUser> {
  if (input.tempPassword === undefined) {
    return inviteUser(deps, input.email, input.role);
  }
  const created = unwrap(
    await deps.admin.auth.admin.createUser({
      email: input.email,
      password: input.tempPassword,
      email_confirm: true,
      app_metadata: { role: input.role },
      user_metadata: { must_change_password: true },
    }),
  ).user;
  return toAdminUser(requireUser(created), deps.now());
}

async function updateTarget(
  deps: HandlerDeps,
  id: string,
  attributes: Parameters<AdminClient['auth']['admin']['updateUserById']>[1],
): Promise<AdminUser> {
  const updated = unwrap(await deps.admin.auth.admin.updateUserById(id, attributes)).user;
  return toAdminUser(requireUser(updated), deps.now());
}

function assertNotSelf(caller: User, id: string, what: string): void {
  if (caller.id === id) {
    fail('forbidden', `You cannot ${what} your own account`);
  }
}

async function setRole(deps: HandlerDeps, caller: User, id: string, role: Role): Promise<AdminUser> {
  const target = await loadTarget(deps, id);
  if (role !== 'admin') {
    assertNotSelf(caller, id, 'demote');
    await assertNotLastAdmin(deps, target);
  }
  return updateTarget(deps, id, { app_metadata: { role } });
}

async function setBanned(deps: HandlerDeps, caller: User, id: string, banned: boolean): Promise<AdminUser> {
  const target = await loadTarget(deps, id);
  if (banned) {
    assertNotSelf(caller, id, 'ban');
    await assertNotLastAdmin(deps, target);
  }
  return updateTarget(deps, id, { ban_duration: banned ? BAN_FOREVER : BAN_NONE });
}

/** Lists every object under `{userId}/` (folders are walked, files are returned). */
async function listObjectPaths(deps: HandlerDeps, userId: string): Promise<string[]> {
  const bucket = deps.admin.storage.from(BUCKET);
  const files: string[] = [];
  const folders = [userId];
  for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
    let offset = 0;
    let entries: { id: string | null; name: string }[];
    do {
      entries = unwrap(await bucket.list(folder, { limit: STORAGE_PAGE_SIZE, offset })) ?? [];
      for (const entry of entries) {
        (entry.id ? files : folders).push(`${folder}/${entry.name}`);
      }
      offset += STORAGE_PAGE_SIZE;
    } while (entries.length === STORAGE_PAGE_SIZE);
  }
  return files;
}

async function deleteAccount(deps: HandlerDeps, id: string): Promise<null> {
  const paths = await listObjectPaths(deps, id);
  const bucket = deps.admin.storage.from(BUCKET);
  for (let start = 0; start < paths.length; start += STORAGE_PAGE_SIZE) {
    unwrap(await bucket.remove(paths.slice(start, start + STORAGE_PAGE_SIZE)));
  }
  unwrap(await deps.admin.auth.admin.deleteUser(id));
  return null;
}

async function deleteUser(deps: HandlerDeps, caller: User, id: string): Promise<null> {
  const target = await loadTarget(deps, id);
  assertNotSelf(caller, id, 'delete');
  await assertNotLastAdmin(deps, target);
  return deleteAccount(deps, id);
}

async function deleteSelf(deps: HandlerDeps, caller: User): Promise<null> {
  await assertNotLastAdmin(deps, caller);
  return deleteAccount(deps, caller.id);
}

async function dispatch(deps: HandlerDeps, caller: User, action: AdminAction): Promise<unknown> {
  if (action.action === 'deleteSelf') {
    return deleteSelf(deps, caller);
  }
  if (roleOf(caller) !== 'admin') {
    fail('forbidden', 'Admin role required');
  }
  switch (action.action) {
    case 'listUsers':
      return listUsers(deps);
    case 'createUser':
      return createUser(deps, action);
    case 'setRole':
      return setRole(deps, caller, action.id, action.role);
    case 'setBanned':
      return setBanned(deps, caller, action.id, action.banned);
    case 'deleteUser':
      return deleteUser(deps, caller, action.id);
  }
}

// ------------------------------------------------------------------ HTTP

function normaliseOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
}

/** Default origins plus the comma-separated extras (e.g. a custom domain); anything that is not https/loopback is dropped. */
export function resolveAllowedOrigins(extra: string | undefined): string[] {
  const extras = (extra ?? '').split(',').map(normaliseOrigin);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extras.filter((origin) => origin !== null)])];
}

function corsHeaders(deps: HandlerDeps, request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin === null || !deps.allowedOrigins.includes(origin)) {
    return { Vary: 'Origin' };
  }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
  };
}

function jsonResponse(status: number, body: AdminResponse<unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function failureResponse(deps: HandlerDeps, error: unknown, cors: Record<string, string>): Response {
  if (error instanceof FunctionFailure) {
    return jsonResponse(STATUS[error.code], { ok: false, error: { code: error.code, message: error.message } }, cors);
  }
  deps.logError(`admin-users failed: ${error instanceof Error ? error.name : 'non-error thrown'}`);
  return jsonResponse(500, { ok: false, error: { code: 'unknown', message: 'Unexpected error' } }, cors);
}

export function createHandler(deps: HandlerDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const cors = corsHeaders(deps, request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      if (request.method !== 'POST') {
        fail('validation', 'Use POST');
      }
      const caller = await authenticate(deps, request);
      const action = parseAction(parseBody(await request.text()));
      const data = await dispatch(deps, caller, action);
      return jsonResponse(200, { ok: true, data }, cors);
    } catch (error) {
      return failureResponse(deps, error, cors);
    }
  };
}
