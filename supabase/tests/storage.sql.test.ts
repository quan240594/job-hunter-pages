// Storage: private `documents` bucket and the per-user path policies on storage.objects.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALEX, BLAKE, DOCX, PDF, asAnon, asUser, createDb, rejection, type Db } from './db';

const RLS_VIOLATION = 'row-level security';
let db: Db;

const object = (path: string, bucket = 'documents') =>
  `insert into storage.objects (bucket_id, name) values ('${bucket}', '${path}')`;

beforeAll(async () => {
  db = await createDb();
  await db.exec(`insert into storage.buckets (id, name) values ('other', 'other')`);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec('truncate storage.objects');
  await db.exec(
    [
      object(`${ALEX}/d1/cv.pdf`),
      object(`${BLAKE}/d2/cv.pdf`),
      object(`${ALEX}/d3/cv.pdf`, 'other'),
    ].join(';'),
  );
});

describe('bucket', () => {
  it('is private with a 10 MB limit and pdf/docx only', async () => {
    const result = await db.query(`select * from storage.buckets where id = 'documents'`);
    expect(result.rows).toEqual([
      { id: 'documents', name: 'documents', public: false, file_size_limit: 10_485_760, allowed_mime_types: [PDF, DOCX] },
    ]);
  });
});

describe('policies', () => {
  it('lets a user list only objects under their own user id in the documents bucket', async () => {
    const result = await asUser(db, ALEX, () => db.query<{ name: string }>('select name from storage.objects'));
    expect(result.rows).toEqual([{ name: `${ALEX}/d1/cv.pdf` }]);
  });

  it('lets a user upload under their own prefix', async () => {
    await asUser(db, ALEX, () => db.exec(object(`${ALEX}/d4/letter.pdf`)));
    const result = await db.query(`select 1 from storage.objects where name = '${ALEX}/d4/letter.pdf'`);
    expect(result.rows).toHaveLength(1);
  });

  it.each([
    ['another user prefix', (): string => object(`${BLAKE}/d9/cv.pdf`)],
    ['a path without a folder', (): string => object(ALEX)],
    ['a look-alike prefix', (): string => object(`${ALEX}x/d9/cv.pdf`)],
    ['another bucket', (): string => object(`${ALEX}/d9/cv.pdf`, 'other')],
  ])('rejects an upload to %s', async (_label, sql) => {
    const error = await asUser(db, ALEX, () => rejection(db.exec(sql())));
    expect(error.message).toContain(RLS_VIOLATION);
  });

  it('lets a user update and delete their own object only', async () => {
    await asUser(db, ALEX, async () => {
      const own = await db.query(`update storage.objects set metadata = '{}' where name = '${ALEX}/d1/cv.pdf'`);
      expect(own.affectedRows).toBe(1);
      const foreign = await db.query(`update storage.objects set metadata = '{}' where name = '${BLAKE}/d2/cv.pdf'`);
      expect(foreign.affectedRows).toBe(0);
      const foreignDelete = await db.query(`delete from storage.objects where name = '${BLAKE}/d2/cv.pdf'`);
      expect(foreignDelete.affectedRows).toBe(0);
      const ownDelete = await db.query(`delete from storage.objects where name = '${ALEX}/d1/cv.pdf'`);
      expect(ownDelete.affectedRows).toBe(1);
    });
    const remaining = await db.query('select 1 from storage.objects');
    expect(remaining.rows).toHaveLength(2);
  });

  it("cannot move an object into another user's folder", async () => {
    const error = await asUser(db, ALEX, () =>
      rejection(db.exec(`update storage.objects set name = '${BLAKE}/d1/cv.pdf' where name = '${ALEX}/d1/cv.pdf'`)),
    );
    expect(error.message).toContain(RLS_VIOLATION);
  });

  it('gives anon nothing', async () => {
    const error = await asAnon(db, () => rejection(db.query('select * from storage.objects')));
    expect(error.message).toContain('permission denied');
  });

  it('exposes nothing to an authenticated request without a user id', async () => {
    await db.exec('set role authenticated');
    try {
      expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    } finally {
      await db.exec('reset role');
    }
  });
});
