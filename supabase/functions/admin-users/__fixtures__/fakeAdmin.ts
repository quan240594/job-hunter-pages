// In-memory stand-in for the service-role Supabase client used by the admin-users handler tests.
import type { User } from '@supabase/supabase-js';
import type { AdminClient } from '../handler.ts';

export const NOW = Date.parse('2026-10-20T10:00:00Z');
export const ORIGIN = 'https://quan240594.github.io';

export interface ErrorLike {
  message: string;
  code?: string;
}

let sequence = 0;

export function uuid(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

export function makeUser(overrides: Partial<User> & { role?: 'admin' | 'user' } = {}): User {
  const { role, ...rest } = overrides;
  return {
    id: uuid(),
    aud: 'authenticated',
    email: 'alex@example.com',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: role ? { role } : {},
    user_metadata: {},
    ...rest,
  };
}

interface StoredObject {
  path: string;
}

/** Everything the handler can ask the client for, with failure injection per method name. */
export class FakeAdmin {
  readonly users = new Map<string, User>();
  readonly tokens = new Map<string, string>();
  readonly objects: StoredObject[] = [];
  readonly calls: string[] = [];
  readonly buckets: string[] = [];
  readonly failures = new Map<string, ErrorLike>();
  readonly throwOn = new Map<string, unknown>();
  /** method name -> 1-based call number from which the method answers `{ user: null }` without an error. */
  readonly nullUserFrom = new Map<string, number>();
  readonly inviteMetadata: unknown[] = [];
  readonly createdWith: unknown[] = [];
  readonly updatedWith: unknown[] = [];
  readonly listPages: number[] = [];

  addUser(user: User, token?: string): User {
    this.users.set(user.id, user);
    if (token) {
      this.tokens.set(token, user.id);
    }
    return user;
  }

  addObjects(...paths: string[]): void {
    this.objects.push(...paths.map((path) => ({ path })));
  }

  private respond<T>(method: string, data: T, failureData: unknown): { data: T; error: null } {
    this.calls.push(method);
    if (this.throwOn.has(method)) {
      throw this.throwOn.get(method);
    }
    const error = this.failures.get(method);
    if (error) {
      return { data: failureData as T, error } as unknown as { data: T; error: null };
    }
    return { data, error: null };
  }

  private userResult(method: string, user: User | undefined, missing: ErrorLike) {
    const empty = { user: null };
    const calls = this.calls.filter((call) => call === method).length + 1;
    if (calls >= (this.nullUserFrom.get(method) ?? Infinity)) {
      return this.respond(method, empty, empty);
    }
    if (!user) {
      this.calls.push(method);
      return { data: empty, error: missing };
    }
    return this.respond(method, { user }, empty);
  }

  private newUser(email: string, metadata: Record<string, unknown>, appMetadata: Record<string, unknown>): User {
    const user = makeUser({ email, user_metadata: metadata, app_metadata: appMetadata });
    this.users.set(user.id, user);
    return user;
  }

  private create(method: string, email: string, metadata: Record<string, unknown>, appMetadata: Record<string, unknown>) {
    const exists = [...this.users.values()].some((user) => user.email === email);
    const user = exists ? undefined : this.newUser(email, metadata, appMetadata);
    return this.userResult(method, user, { code: 'email_exists', message: 'exists' });
  }

  private listEntries(prefix: string): { id: string | null; name: string }[] {
    const entries = new Map<string, { id: string | null; name: string }>();
    for (const { path } of this.objects) {
      if (path.startsWith(`${prefix}/`)) {
        const [name, ...deeper] = path.slice(prefix.length + 1).split('/');
        entries.set(name, { id: deeper.length > 0 ? null : 'object-id', name });
      }
    }
    return [...entries.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  }

  client(): AdminClient {
    const fake = {
      auth: {
        getUser: (token: string) =>
          this.userResult('getUser', this.users.get(this.tokens.get(token) ?? ''), { message: 'invalid JWT' }),
        admin: {
          getUserById: (id: string) =>
            this.userResult('getUserById', this.users.get(id), { code: 'user_not_found', message: 'missing' }),
          listUsers: ({ page, perPage }: { page: number; perPage: number }) => {
            this.listPages.push(page);
            const all = [...this.users.values()];
            return Promise.resolve(
              this.respond('listUsers', { users: all.slice((page - 1) * perPage, page * perPage) }, { users: [] }),
            );
          },
          createUser: (attributes: { email: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> }) => {
            this.createdWith.push(attributes);
            return Promise.resolve(this.create('createUser', attributes.email, attributes.user_metadata, attributes.app_metadata));
          },
          inviteUserByEmail: (email: string, options: { data: Record<string, unknown> }) => {
            this.inviteMetadata.push(options);
            return Promise.resolve(this.create('inviteUserByEmail', email, options.data, {}));
          },
          updateUserById: (id: string, attributes: { app_metadata?: Record<string, unknown>; ban_duration?: string }) => {
            this.updatedWith.push(attributes);
            const user = this.users.get(id);
            if (user && !this.failures.has('updateUserById')) {
              this.applyUpdate(user, attributes);
            }
            return Promise.resolve(this.userResult('updateUserById', user, { code: 'user_not_found', message: 'missing' }));
          },
          deleteUser: (id: string) => {
            const result = this.respond('deleteUser', { user: null }, { user: null });
            this.users.delete(id);
            return Promise.resolve(result);
          },
        },
      },
      storage: {
        from: (bucket: string) => {
          this.buckets.push(bucket);
          return {
            list: (prefix: string, options: { limit: number; offset: number }) =>
              Promise.resolve(
                this.respond(
                  'list',
                  this.nullUserFrom.has('list')
                    ? null
                    : this.listEntries(prefix).slice(options.offset, options.offset + options.limit),
                  null,
                ),
              ),
            remove: (paths: string[]) => {
              const result = this.respond('remove', paths, null);
              this.objects.splice(0, this.objects.length, ...this.objects.filter((o) => !paths.includes(o.path)));
              return Promise.resolve(result);
            },
          };
        },
      },
    };
    return fake as unknown as AdminClient;
  }

  private applyUpdate(user: User, attributes: { app_metadata?: Record<string, unknown>; ban_duration?: string }): void {
    if (attributes.app_metadata) {
      user.app_metadata = { ...user.app_metadata, ...attributes.app_metadata };
    }
    if (attributes.ban_duration === 'none') {
      delete user.banned_until;
    } else if (attributes.ban_duration) {
      user.banned_until = new Date(NOW + 100 * 365 * 24 * 3600 * 1000).toISOString();
    }
  }
}
