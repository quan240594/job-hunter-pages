// Local mirror of the admin-users part of docs/CONTRACT.md / src/api/types.ts. Edge Functions are bundled on their own,
// so they cannot import from src/; handler.test.ts proves these shapes stay assignable to the shared contract.

export type Role = 'admin' | 'user';

export type FunctionErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'unknown';

export interface FunctionError {
  code: FunctionErrorCode;
  message: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  lastSignInAt: string | null;
  banned: boolean;
}

export type AdminAction =
  | { action: 'listUsers' }
  | { action: 'createUser'; email: string; tempPassword?: string; role: Role }
  | { action: 'setRole'; id: string; role: Role }
  | { action: 'setBanned'; id: string; banned: boolean }
  | { action: 'deleteUser'; id: string }
  | { action: 'deleteSelf' };

export type AdminResponse<T> = { ok: true; data: T } | { ok: false; error: FunctionError };
