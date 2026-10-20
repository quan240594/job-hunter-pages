import type { DataApi } from '../api/dataApi';
import type { AdminUser, ApiErrorCode, CreateUserInput } from '../api/types';

export type FakeAdminApi = DataApi['admin'];

export const ADMIN_USER: AdminUser = {
  id: 'user-admin',
  email: 'admin@example.com',
  role: 'admin',
  createdAt: '2026-01-05T09:00:00Z',
  lastSignInAt: '2026-10-19T08:30:00Z',
  banned: false,
};
export const ALEX_USER: AdminUser = {
  id: 'user-alex',
  email: 'alex@example.com',
  role: 'user',
  createdAt: '2026-02-10T12:00:00Z',
  lastSignInAt: null,
  banned: false,
};
export const SAM_USER: AdminUser = {
  id: 'user-sam',
  email: 'sam@example.com',
  role: 'user',
  createdAt: '2026-03-01T12:00:00Z',
  lastSignInAt: '2026-09-30T18:45:00Z',
  banned: true,
};

const reject = (code: ApiErrorCode, message: string) => Promise.reject(Object.assign(new Error(message), { code }));

export interface FakeAdmin {
  admin: FakeAdminApi;
  users: () => AdminUser[];
  created: CreateUserInput[];
}

/** In-memory AdminApi that applies the contract's guards: no self changes, never remove the last admin. */
export function createFakeAdmin(initial: readonly AdminUser[], callerId = ADMIN_USER.id): FakeAdmin {
  let users = initial.map((user) => ({ ...user }));
  const created: CreateUserInput[] = [];

  const guarded = (id: string) => {
    const target = users.find((user) => user.id === id);
    if (target === undefined) return reject('not_found', 'no such user');
    const lastAdmin = target.role === 'admin' && users.filter((user) => user.role === 'admin').length === 1;
    if (id === callerId || lastAdmin) return reject('forbidden', 'guard');
    return Promise.resolve(target);
  };

  const admin: FakeAdminApi = {
    listUsers: () => Promise.resolve(users.map((user) => ({ ...user }))),
    createUser: (input) => {
      if (users.some((user) => user.email === input.email)) return reject('conflict', 'exists');
      created.push(input);
      const user: AdminUser = {
        id: `user-${users.length + 1}`,
        email: input.email,
        role: input.role,
        createdAt: '2026-10-20T08:00:00Z',
        lastSignInAt: null,
        banned: false,
      };
      users = [...users, user];
      return Promise.resolve(user);
    },
    setRole: async (id, role) => {
      const target = await guarded(id);
      target.role = role;
      return { ...target };
    },
    setBanned: async (id, banned) => {
      const target = await guarded(id);
      target.banned = banned;
      return { ...target };
    },
    deleteUser: async (id) => {
      await guarded(id);
      users = users.filter((user) => user.id !== id);
    },
  };
  return { admin, users: () => users, created };
}
