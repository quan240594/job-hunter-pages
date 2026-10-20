// Test harness for the SQL tests: boots PGlite (Postgres in WASM), loads the stand-in schemas and every migration in
// timestamp order, and offers helpers to run statements as a given end user (RLS applies) or as the service role.
import { PGlite } from '@electric-sql/pglite';
import stubSql from './stub.sql?raw';

const migrations = import.meta.glob<string>('../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const ALEX = '00000000-0000-4000-8000-0000000000a1';
export const BLAKE = '00000000-0000-4000-8000-0000000000b2';
export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type Db = PGlite;

export async function runMigrations(db: Db): Promise<void> {
  const files = Object.keys(migrations).toSorted((a, b) => a.localeCompare(b));
  for (const file of files) {
    await db.exec(migrations[file]);
  }
}

export async function createDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(stubSql);
  await runMigrations(db);
  await db.exec(`insert into auth.users (id, email) values
    ('${ALEX}', 'alex@example.com'), ('${BLAKE}', 'blake@example.com')`);
  return db;
}

/** Runs `fn` with the session of an authenticated end user: role `authenticated`, auth.uid() = userId. */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Runs `fn` as an unauthenticated request (role anon, no uid). */
export async function asAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

/** Runs `fn` as the service role (bypasses RLS, auth.uid() is null). */
export async function asService<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

/** Resolves with the error message/code of a rejected promise, or fails the test when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await promise;
  } catch (error) {
    const { message, code } = error as { message: string; code?: string };
    return { message, code };
  }
  throw new Error('expected the statement to be rejected');
}

export function jobSql(userId: string, id: string): string {
  return `insert into public.jobs (user_id, id, title, company, source)
    values ('${userId}', '${id}', 'Frontend Engineer', 'Example BV', 'manual')`;
}
