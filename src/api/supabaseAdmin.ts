import type { AdminApi } from './dataApi';
import { apiError, isApiErrorCode } from './errors';
import { adminUserFromJson } from './mappers';
import { guarded, type Client } from './supabaseCommon';
import { mapError } from './supabaseErrors';
import type { AdminAction, AdminUser, ApiError, CreateUserInput, Role } from './types';

const FUNCTION_NAME = 'admin-users';
const UNEXPECTED = 'Unexpected response from the admin service.';

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null ? (value as Fields) : {};
}

/** `{ ok: false, error: { code, message } }` from the function body, or unknown when the body is not that shape. */
function errorFromBody(value: unknown): ApiError {
  const { code, message } = fieldsOf(value);
  return typeof message === 'string' && isApiErrorCode(code) ? apiError(code, message) : apiError('unknown', UNEXPECTED);
}

/** supabase-js hides the JSON body of a non-2xx answer in `error.context` (the Response); recover our ApiError. */
async function errorFromResponse(error: unknown): Promise<ApiError> {
  const context = fieldsOf(fieldsOf(error).context);
  if (typeof context.json !== 'function') return mapError(error);
  try {
    const body = fieldsOf(await context.json());
    return body.ok === false ? errorFromBody(body.error) : mapError(error);
  } catch {
    return mapError(error);
  }
}

function unwrap(body: unknown): unknown {
  const fields = fieldsOf(body);
  if (fields.ok === true) return fields.data;
  if (fields.ok === false) throw errorFromBody(fields.error);
  throw apiError('unknown', UNEXPECTED);
}

/** POST /functions/v1/admin-users; unwraps `{ ok: true, data }` and throws the ApiError of `{ ok: false, error }`. */
export async function callAdmin(client: Client, body: AdminAction): Promise<unknown> {
  const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body });
  if (error) throw await errorFromResponse(error);
  return unwrap(data);
}

async function listUsers(client: Client): Promise<AdminUser[]> {
  const data = await callAdmin(client, { action: 'listUsers' });
  if (!Array.isArray(data)) throw apiError('unknown', UNEXPECTED);
  return data.map(adminUserFromJson);
}

export function buildAdmin(client: Client): AdminApi {
  return {
    listUsers: guarded(() => listUsers(client)),
    createUser: guarded(async (input: CreateUserInput) =>
      adminUserFromJson(await callAdmin(client, { action: 'createUser', ...input })),
    ),
    setRole: guarded(async (id: string, role: Role) => adminUserFromJson(await callAdmin(client, { action: 'setRole', id, role }))),
    setBanned: guarded(async (id: string, banned: boolean) =>
      adminUserFromJson(await callAdmin(client, { action: 'setBanned', id, banned })),
    ),
    deleteUser: guarded(async (id: string) => {
      await callAdmin(client, { action: 'deleteUser', id });
    }),
  };
}
