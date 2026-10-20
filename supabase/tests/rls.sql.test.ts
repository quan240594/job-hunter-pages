// Row Level Security isolation: user A can never read or change user B's rows; anon has no access at all.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALEX, BLAKE, PDF, asAnon, asService, asUser, createDb, jobSql, rejection, type Db } from './db';

const RLS_VIOLATION = 'row-level security';
const DENIED = 'permission denied';

interface TableCase {
  table: string;
  /** SQL inserting the table's row for `user`. */
  insert: (user: string) => string;
  /** SET clause for an update that is valid for the table. */
  set: string;
  /** Primary-key filter for `user`'s row. */
  where: (user: string) => string;
}

const docId = (user: string) => `${user.slice(0, -3)}d${user.slice(-2)}`;

const cases: TableCase[] = [
  {
    table: 'profiles',
    insert: (u) => `insert into public.profiles (user_id, display_name) values ('${u}', 'Alex Example')`,
    set: `headline = 'changed'`,
    where: (u) => `user_id = '${u}'`,
  },
  {
    table: 'jobs',
    insert: (u) => jobSql(u, 'job-1'),
    set: `title = 'changed'`,
    where: (u) => `user_id = '${u}' and id = 'job-1'`,
  },
  {
    table: 'documents',
    insert: (u) => `insert into public.documents (id, user_id, kind, filename, mime, size_bytes, storage_path)
      values ('${docId(u)}', '${u}', 'cv', 'cv.pdf', '${PDF}', 1000, '${u}/${docId(u)}/cv.pdf')`,
    set: `filename = 'changed.pdf'`,
    where: (u) => `user_id = '${u}'`,
  },
  {
    table: 'applications',
    insert: (u) => `insert into public.applications (user_id, job_id) values ('${u}', 'job-1')`,
    set: `notes = 'changed'`,
    where: (u) => `user_id = '${u}'`,
  },
];

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

// Fresh, identical data for both users before every test (superuser bypasses RLS; cases are in dependency order).
beforeEach(async () => {
  await db.exec('truncate public.applications, public.documents, public.jobs, public.profiles');
  for (const user of [ALEX, BLAKE]) {
    for (const { insert } of cases) {
      await db.exec(insert(user));
    }
  }
});

afterAll(async () => {
  await db.close();
});

describe.each(cases)('$table', ({ table, insert, set, where }) => {
  it('lets a user read only their own rows', async () => {
    const result = await asUser(db, ALEX, () => db.query<{ user_id: string }>(`select user_id from public.${table}`));
    expect(result.rows.map((row) => row.user_id)).toEqual([ALEX]);
  });

  it('lets a user update and then delete their own row', async () => {
    await asUser(db, BLAKE, async () => {
      const updated = await db.query(`update public.${table} set ${set} where ${where(BLAKE)}`);
      expect(updated.affectedRows).toBe(1);
      const deleted = await db.query(`delete from public.${table} where ${where(BLAKE)}`);
      expect(deleted.affectedRows).toBe(1);
    });
  });

  it("cannot update another user's row", async () => {
    const updated = await asUser(db, ALEX, () =>
      db.query(`update public.${table} set ${set} where ${where(BLAKE)}`),
    );
    expect(updated.affectedRows).toBe(0);
  });

  it("cannot delete another user's row", async () => {
    const deleted = await asUser(db, ALEX, () => db.query(`delete from public.${table} where ${where(BLAKE)}`));
    expect(deleted.affectedRows).toBe(0);
    const remaining = await asService(db, () => db.query(`select 1 from public.${table} where ${where(BLAKE)}`));
    expect(remaining.rows).toHaveLength(1);
  });

  it('cannot insert a row for another user', async () => {
    await db.exec(`delete from public.${table} where ${where(BLAKE)}`);
    const error = await asUser(db, ALEX, () => rejection(db.exec(insert(BLAKE))));
    expect(error.message).toContain(RLS_VIOLATION);
  });

  it('cannot hand a row over to another user', async () => {
    const error = await asUser(db, ALEX, () =>
      rejection(db.exec(`update public.${table} set user_id = '${BLAKE}' where ${where(ALEX)}`)),
    );
    expect(error.message).toContain(RLS_VIOLATION);
  });

  it('is invisible and untouchable for anon', async () => {
    const selectError = await asAnon(db, () => rejection(db.query(`select * from public.${table}`)));
    expect(selectError.message).toContain(DENIED);
    const insertError = await asAnon(db, () => rejection(db.exec(insert(ALEX))));
    expect(insertError.message).toContain(DENIED);
  });

  it('sees nothing without a user id even as authenticated', async () => {
    await db.exec('set role authenticated');
    try {
      const result = await db.query(`select * from public.${table}`);
      expect(result.rows).toEqual([]);
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('policies', () => {
  it('enables and forces RLS with four owner-only policies on every table', async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(result.rows).toEqual(
      cases
        .map(({ table }) => ({ relname: table, relrowsecurity: true, relforcerowsecurity: true }))
        .toSorted((a, b) => a.relname.localeCompare(b.relname)),
    );
    const policies = await db.query<{ tablename: string; cmd: string; roles: string }>(
      `select tablename, cmd, roles::text from pg_policies where schemaname = 'public' order by tablename, cmd`,
    );
    expect(policies.rows).toHaveLength(cases.length * 4);
    expect(new Set(policies.rows.map((row) => row.roles))).toEqual(new Set(['{authenticated}']));
  });

  it('lets an application reference only its own jobs and documents', async () => {
    const otherDocument = docId(BLAKE);
    const error = await asUser(db, ALEX, () =>
      rejection(
        db.exec(`update public.applications set cv_document_id = '${otherDocument}' where user_id = '${ALEX}'`),
      ),
    );
    expect(error.message).toContain('foreign key');
    const otherJob = await asUser(db, ALEX, () =>
      rejection(db.exec(`insert into public.applications (user_id, job_id) values ('${ALEX}', 'missing-job')`)),
    );
    expect(otherJob.message).toContain('foreign key');
  });
});
