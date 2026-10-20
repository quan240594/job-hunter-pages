// documents: server-side expiry, the 3-template cap, immutable created_at, column checks and the cleanup functions.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALEX, BLAKE, DOCX, PDF, asAnon, asService, asUser, createDb, jobSql, rejection, type Db } from './db';

let db: Db;
let counter = 0;

const nextId = () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

interface DocumentOptions {
  id?: string;
  user?: string;
  kind?: string;
  mime?: string;
  size?: number;
  path?: string;
  createdAt?: string;
  expiresAt?: string;
}

function insertDocument(options: DocumentOptions = {}): string {
  const { id = nextId(), user = ALEX, kind = 'cv', mime = PDF, size = 1000 } = options;
  const path = options.path ?? `${user}/${id}/file.pdf`;
  const createdAt = options.createdAt ? `'${options.createdAt}'` : 'default';
  const expiresAt = options.expiresAt ? `'${options.expiresAt}'` : 'null';
  return `insert into public.documents (id, user_id, kind, filename, mime, size_bytes, storage_path, created_at, expires_at)
    values ('${id}', '${user}', '${kind}', 'file.pdf', '${mime}', ${size}, '${path}', ${createdAt}, ${expiresAt})`;
}

const addAs = (user: string, options: DocumentOptions = {}) =>
  asUser(db, user, () => db.exec(insertDocument({ ...options, user })));

async function templateCount(user: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `select count(*)::int as count from public.documents where user_id = $1 and kind = 'template'`,
    [user],
  );
  return result.rows[0].count;
}

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec('truncate public.applications, public.documents, public.jobs');
});

describe('expiry derivation', () => {
  it.each(['cv', 'letter'])('sets expires_at = created_at + 6 months for %s and ignores the client value', async (kind) => {
    await addAs(ALEX, { id: nextId(), kind, expiresAt: '2099-01-01T00:00:00Z' });
    const result = await db.query<{ ok: boolean; fresh: boolean }>(
      `select expires_at = created_at + interval '6 months' as ok,
              created_at > now() - interval '1 minute' as fresh from public.documents`,
    );
    expect(result.rows).toEqual([{ ok: true, fresh: true }]);
  });

  it('leaves templates without an expiry, whatever the client sends', async () => {
    await addAs(ALEX, { kind: 'template', expiresAt: '2030-01-01T00:00:00Z' });
    const result = await db.query<{ expires_at: string | null }>('select expires_at from public.documents');
    expect(result.rows).toEqual([{ expires_at: null }]);
  });

  it('does not let a user pick created_at on insert', async () => {
    await addAs(ALEX, { createdAt: '2099-01-01T00:00:00Z' });
    const result = await db.query<{ future: boolean }>(
      `select created_at > now() + interval '1 day' as future from public.documents`,
    );
    expect(result.rows).toEqual([{ future: false }]);
  });

  it('does not let a user change created_at, and re-derives expires_at when the kind changes', async () => {
    const id = nextId();
    await addAs(ALEX, { id, kind: 'template' });
    await asUser(db, ALEX, () =>
      db.exec(`update public.documents set created_at = '2099-01-01T00:00:00Z', kind = 'cv' where id = '${id}'`),
    );
    const cv = await db.query<{ ok: boolean; future: boolean }>(
      `select expires_at = created_at + interval '6 months' as ok, created_at > now() as future
       from public.documents where id = '${id}'`,
    );
    expect(cv.rows).toEqual([{ ok: true, future: false }]);
    await asUser(db, ALEX, () => db.exec(`update public.documents set kind = 'template' where id = '${id}'`));
    const template = await db.query<{ expires_at: string | null }>(
      `select expires_at from public.documents where id = '${id}'`,
    );
    expect(template.rows).toEqual([{ expires_at: null }]);
  });

  it('honours created_at set by the service role', async () => {
    await asService(db, () => db.exec(insertDocument({ createdAt: '2026-01-31T12:00:00Z' })));
    const result = await db.query<{ expires_at: string }>(
      `select (expires_at at time zone 'UTC')::text as expires_at from public.documents`,
    );
    expect(result.rows[0].expires_at).toContain('2026-07-31 12:00:00');
  });
});

describe('template limit', () => {
  it('rejects the 4th template with template_limit and SQLSTATE P0001', async () => {
    for (let i = 0; i < 3; i++) {
      await addAs(ALEX, { kind: 'template' });
    }
    const error = await rejection(addAs(ALEX, { kind: 'template' }));
    expect(error).toEqual({ message: 'template_limit', code: 'P0001' });
    expect(await templateCount(ALEX)).toBe(3);
  });

  it('counts per user and only templates', async () => {
    for (let i = 0; i < 3; i++) {
      await addAs(ALEX, { kind: 'template' });
    }
    await addAs(ALEX, { kind: 'cv' });
    await addAs(ALEX, { kind: 'letter' });
    await addAs(BLAKE, { kind: 'template' });
    expect(await templateCount(BLAKE)).toBe(1);
  });

  it('frees a slot when a template is deleted', async () => {
    const first = nextId();
    await addAs(ALEX, { id: first, kind: 'template' });
    await addAs(ALEX, { kind: 'template' });
    await addAs(ALEX, { kind: 'template' });
    await asUser(db, ALEX, () => db.exec(`delete from public.documents where id = '${first}'`));
    await addAs(ALEX, { kind: 'template' });
    expect(await templateCount(ALEX)).toBe(3);
  });

  it('applies to the service role too and to turning a cv into a 4th template', async () => {
    for (let i = 0; i < 3; i++) {
      await asService(db, () => db.exec(insertDocument({ kind: 'template' })));
    }
    const serviceError = await rejection(asService(db, () => db.exec(insertDocument({ kind: 'template' }))));
    expect(serviceError.message).toBe('template_limit');

    const cv = nextId();
    await addAs(ALEX, { id: cv, kind: 'cv' });
    const updateError = await rejection(
      asUser(db, ALEX, () => db.exec(`update public.documents set kind = 'template' where id = '${cv}'`)),
    );
    expect(updateError.message).toBe('template_limit');
  });

  it('lets a full user edit an existing template', async () => {
    const ids = [nextId(), nextId(), nextId()];
    for (const id of ids) {
      await addAs(ALEX, { id, kind: 'template' });
    }
    const updated = await asUser(db, ALEX, () =>
      db.query(`update public.documents set filename = 'renamed.pdf' where id = '${ids[0]}'`),
    );
    expect(updated.affectedRows).toBe(1);
  });
});

describe('column checks', () => {
  it.each([
    ['kind', { kind: 'poster' }, 'documents_kind_check'],
    ['mime', { mime: 'image/png' }, 'documents_mime_check'],
    ['size above 10 MB', { size: 10_485_761 }, 'documents_size_check'],
    ['empty file', { size: 0 }, 'documents_size_check'],
    ['storage path of another user', { path: `${BLAKE}/x/file.pdf` }, 'documents_storage_path_check'],
  ])('rejects an invalid %s', async (_label, options, constraint) => {
    const error = await rejection(asService(db, () => db.exec(insertDocument(options))));
    expect(error.message).toContain(constraint);
  });

  it('accepts a docx of exactly 10 MB', async () => {
    await addAs(ALEX, { mime: DOCX, size: 10_485_760 });
    expect(await templateCount(ALEX)).toBe(0);
  });
});

describe('cleanup functions (service role only)', () => {
  const EXPIRED = '2026-01-01T00:00:00Z';
  let expiredId: string;
  let freshId: string;
  let templateId: string;

  beforeEach(async () => {
    expiredId = nextId();
    freshId = nextId();
    templateId = nextId();
    await asService(db, async () => {
      await db.exec(insertDocument({ id: expiredId, createdAt: EXPIRED }));
      await db.exec(insertDocument({ id: freshId }));
      await db.exec(insertDocument({ id: templateId, kind: 'template', createdAt: EXPIRED, user: BLAKE }));
    });
  });

  it('lists only expired documents with id, user_id and storage_path', async () => {
    const result = await asService(db, () =>
      db.query<{ id: string; user_id: string; storage_path: string }>('select * from public.expired_documents()'),
    );
    expect(result.rows).toEqual([
      { id: expiredId, user_id: ALEX, storage_path: `${ALEX}/${expiredId}/file.pdf` },
    ]);
  });

  it('purges only documents that are still expired and keeps application labels', async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
    await db.exec(
      `insert into public.applications (user_id, job_id, cv_document_id, cv_label)
       values ('${ALEX}', 'job-1', '${expiredId}', 'CV v3')`,
    );
    const purged = await asService(db, () =>
      db.query<{ purged: number }>(`select public.purge_expired_documents(array['${expiredId}', '${freshId}', '${templateId}']::uuid[]) as purged`),
    );
    expect(purged.rows).toEqual([{ purged: 1 }]);
    const application = await db.query(`select cv_document_id, cv_label, user_id from public.applications`);
    expect(application.rows).toEqual([{ cv_document_id: null, cv_label: 'CV v3', user_id: ALEX }]);
    const remaining = await db.query<{ id: string }>('select id from public.documents order by id');
    expect(remaining.rows.map((row) => row.id)).toEqual([freshId, templateId]);
  });

  it.each([
    ['anon', (fn: () => Promise<unknown>) => asAnon(db, fn)],
    ['authenticated', (fn: () => Promise<unknown>) => asUser(db, ALEX, fn)],
  ])('is not callable by %s', async (_role, run) => {
    const listError = await rejection(run(() => db.query('select * from public.expired_documents()')));
    expect(listError.message).toContain('permission denied');
    const purgeError = await rejection(run(() => db.query(`select public.purge_expired_documents('{}')`)));
    expect(purgeError.message).toContain('permission denied');
  });
});
