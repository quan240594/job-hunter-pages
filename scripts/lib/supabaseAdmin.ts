/**
 * Minimal Supabase service-role client built on plain `fetch` (injected, so tests stay hermetic).
 * Error messages carry only a call label, the HTTP status and the machine-readable error code: never response
 * bodies, paths, emails or keys, because workflow logs of a public repository are public.
 */

export const DOCUMENTS_BUCKET = 'documents';

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[\w.-]{1,64}$/;

export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
  }
}

export interface ExpiredDocument {
  readonly id: string;
  readonly storagePath: string;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string | undefined;
  readonly appMetadata: Readonly<Record<string, unknown>>;
}

export interface AdminClientConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetchFn: typeof fetch;
}

export interface AdminClient {
  listExpiredDocuments(): Promise<ExpiredDocument[]>;
  removeStorageObjects(paths: readonly string[]): Promise<number>;
  deleteDocumentRows(ids: readonly string[]): Promise<number>;
  listAuthUsers(page: number, perPage: number): Promise<AuthUser[]>;
  updateAppMetadata(userId: string, appMetadata: Readonly<Record<string, unknown>>): Promise<void>;
  inviteUser(email: string, userMetadata: Readonly<Record<string, unknown>>): Promise<AuthUser>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function assertUuid(value: string, label: string): void {
  if (!isUuid(value)) {
    throw new Error(`${label}: invalid identifier`);
  }
}

function errorCodeOf(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  return [body.error_code, body.code, body.error].find(
    (value): value is string => typeof value === 'string' && SAFE_CODE_PATTERN.test(value),
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toAuthUser(value: unknown, label: string): AuthUser {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') {
    throw new Error(`${label}: unexpected response`);
  }
  return {
    id: value.id,
    email: typeof value.email === 'string' ? value.email : undefined,
    appMetadata: isRecord(value.app_metadata) ? value.app_metadata : {},
  };
}

function toExpiredDocument(value: unknown): ExpiredDocument {
  if (!isRecord(value) || !isUuid(value.id) || typeof value.storage_path !== 'string' || value.storage_path === '') {
    throw new Error('expired_documents: unexpected response');
  }
  return { id: value.id, storagePath: value.storage_path };
}

function normalizeOrigin(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL');
  }
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error('SUPABASE_URL must be an https:// URL');
  }
  return parsed.origin;
}

export function createAdminClient(config: AdminClientConfig): AdminClient {
  const origin = normalizeOrigin(config.url);
  const authHeaders = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };

  async function request(
    label: string,
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<unknown> {
    const hasBody = options.body !== undefined;
    let response: Response;
    try {
      response = await config.fetchFn(`${origin}${path}`, {
        method,
        headers: { ...authHeaders, ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        body: hasBody ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new SupabaseRequestError(`${label}: network error`, 0);
    }
    const parsed = await readJson(response);
    if (!response.ok) {
      const code = errorCodeOf(parsed);
      const suffix = code ? ` (${code})` : '';
      throw new SupabaseRequestError(`${label} failed with HTTP ${response.status}${suffix}`, response.status, code);
    }
    return parsed;
  }

  return {
    async listExpiredDocuments() {
      const parsed = await request('expired_documents RPC', 'POST', '/rest/v1/rpc/expired_documents', { body: {} });
      if (!Array.isArray(parsed)) {
        throw new TypeError('expired_documents: unexpected response');
      }
      return parsed.map(toExpiredDocument);
    },

    async removeStorageObjects(paths) {
      const parsed = await request('storage remove', 'DELETE', `/storage/v1/object/${DOCUMENTS_BUCKET}`, {
        body: { prefixes: paths },
      });
      return Array.isArray(parsed) ? parsed.length : 0;
    },

    async deleteDocumentRows(ids) {
      for (const id of ids) assertUuid(id, 'documents delete');
      const parsed = await request(
        'documents delete',
        'DELETE',
        `/rest/v1/documents?id=in.(${ids.join(',')})&select=id`,
        { headers: { Prefer: 'return=representation' } },
      );
      return Array.isArray(parsed) ? parsed.length : 0;
    },

    async listAuthUsers(page, perPage) {
      const parsed = await request('auth list users', 'GET', `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
      if (!isRecord(parsed) || !Array.isArray(parsed.users)) {
        throw new TypeError('auth list users: unexpected response');
      }
      return parsed.users.map((user) => toAuthUser(user, 'auth list users'));
    },

    async updateAppMetadata(userId, appMetadata) {
      assertUuid(userId, 'auth update user');
      await request('auth update user', 'PUT', `/auth/v1/admin/users/${userId}`, {
        body: { app_metadata: appMetadata },
      });
    },

    async inviteUser(email, userMetadata) {
      const parsed = await request('auth invite', 'POST', '/auth/v1/invite', {
        body: { email, data: userMetadata },
      });
      return toAuthUser(parsed, 'auth invite');
    },
  };
}
