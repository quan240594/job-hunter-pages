import type { CliIo } from './cli.ts';
import { requireEnv } from './env.ts';
import { createAdminClient, SupabaseRequestError } from './supabaseAdmin.ts';
import type { AdminClient, AuthUser } from './supabaseAdmin.ts';

export type Role = 'admin' | 'user';

const PAGE_SIZE = 200;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const parts = email.split('@');
  const [local = '', domain = ''] = parts;
  const valid =
    parts.length === 2 &&
    local !== '' &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    email.length <= MAX_EMAIL_LENGTH &&
    !/\s/.test(email);
  if (!valid) {
    throw new Error('TARGET_EMAIL is not a valid email address');
  }
  return email;
}

export function parseRole(raw: string | undefined): Role {
  const role = (raw ?? '').trim().toLowerCase();
  if (role === '') return 'user';
  if (role === 'admin' || role === 'user') return role;
  throw new Error("TARGET_ROLE must be 'user' or 'admin'");
}

type UserClient = Pick<AdminClient, 'listAuthUsers' | 'updateAppMetadata' | 'inviteUser'>;

async function findUserByEmail(client: UserClient, email: string): Promise<AuthUser | undefined> {
  for (let page = 1; ; page += 1) {
    const users = await client.listAuthUsers(page, PAGE_SIZE);
    const match = users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (users.length < PAGE_SIZE) return undefined;
  }
}

/** Sets `app_metadata.role` (only the service role can write it), keeping the other app_metadata keys. */
export async function setRole(client: UserClient, rawEmail: string, role: Role): Promise<void> {
  const user = await findUserByEmail(client, normalizeEmail(rawEmail));
  if (!user) {
    throw new Error('No user with that email exists yet: invite them first (invite-user workflow or the dashboard).');
  }
  await client.updateAppMetadata(user.id, { ...user.appMetadata, role });
}

/** Invite by email only: no password is ever generated or printed. The invitee chooses one at first login. */
export async function inviteUser(client: UserClient, rawEmail: string, role: Role): Promise<void> {
  const email = normalizeEmail(rawEmail);
  let invited: AuthUser;
  try {
    invited = await client.inviteUser(email, { must_change_password: true });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.code === 'email_exists') {
      throw new Error('A user with that email already exists; nothing was changed.', { cause: error });
    }
    throw error;
  }
  await client.updateAppMetadata(invited.id, { ...invited.appMetadata, role });
}

function adminClientFrom(io: CliIo): { client: AdminClient; email: string } {
  const env = requireEnv(io.env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TARGET_EMAIL']);
  const client = createAdminClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    fetchFn: io.fetchFn,
  });
  return { client, email: env.TARGET_EMAIL };
}

export async function setAdminRoleMain(io: CliIo): Promise<void> {
  const { client, email } = adminClientFrom(io);
  await setRole(client, email, 'admin');
  io.log('Admin role granted.');
}

export async function inviteUserMain(io: CliIo): Promise<void> {
  const { client, email } = adminClientFrom(io);
  const role = parseRole(io.env.TARGET_ROLE);
  await inviteUser(client, email, role);
  io.log(`Invitation email sent (role: ${role}).`);
}
