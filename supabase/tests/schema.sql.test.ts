// Schema behaviour: column checks, keys, defaults, cascades, updated_at triggers, indexes and migration idempotency.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALEX, BLAKE, PDF, asUser, createDb, jobSql, rejection, runMigrations, type Db } from './db';

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec('truncate public.applications, public.documents, public.jobs, public.profiles');
});

const updateJob = (set: string) => db.exec(`update public.jobs set ${set} where user_id = '${ALEX}' and id = 'job-1'`);

describe('jobs', () => {
  it('applies the contract defaults', async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
    const result = await db.query(`select * from public.jobs`);
    expect(result.rows[0]).toMatchObject({
      location: 'Unknown',
      url: null,
      description: '',
      posted_at: null,
      status: 'new',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      hybrid_quote: null,
      language: 'unknown',
      recommended_document_ids: [],
    });
  });

  it.each([
    ['status', `status = 'done'`, 'jobs_status_check'],
    ['fit above 5', 'fit = 6', 'jobs_fit_check'],
    ['negative fit', 'fit = -1', 'jobs_fit_check'],
    ['category', `category = 'E'`, 'jobs_category_check'],
    ['hybrid', `hybrid = 'maybe'`, 'jobs_hybrid_check'],
    ['language', `language = 'french'`, 'jobs_language_check'],
  ])('rejects an invalid %s', async (_label, set, constraint) => {
    await db.exec(jobSql(ALEX, 'job-1'));
    expect((await rejection(updateJob(set))).message).toContain(constraint);
  });

  it.each([0, 5])('accepts fit %i', async (fit) => {
    await db.exec(jobSql(ALEX, 'job-1'));
    await updateJob(`fit = ${fit}`);
    const result = await db.query(`select fit from public.jobs`);
    expect(result.rows).toEqual([{ fit }]);
  });

  it('rejects an empty id', async () => {
    expect((await rejection(db.exec(jobSql(ALEX, '')))).message).toContain('jobs_id_not_empty');
  });

  it('keys jobs by (user_id, id): two users may share an id, one user may not', async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
    await db.exec(jobSql(BLAKE, 'job-1'));
    expect((await rejection(db.exec(jobSql(ALEX, 'job-1')))).message).toContain('jobs_pkey');
  });

  it('supports the scraper insert-or-ignore without touching existing user edits', async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
    await updateJob(`status = 'applied'`);
    await db.exec(`${jobSql(ALEX, 'job-1')} on conflict (user_id, id) do nothing`);
    const result = await db.query(`select status from public.jobs`);
    expect(result.rows).toEqual([{ status: 'applied' }]);
  });
});

describe('applications', () => {
  beforeEach(async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
  });

  const insertApplication = (stage?: string) =>
    stage === undefined
      ? db.exec(`insert into public.applications (user_id, job_id) values ('${ALEX}', 'job-1')`)
      : db.exec(`insert into public.applications (user_id, job_id, stage) values ('${ALEX}', 'job-1', '${stage}')`);

  it('applies the defaults and allows every stage', async () => {
    await insertApplication();
    const result = await db.query(`select stage, cv_label, notes, cv_document_id from public.applications`);
    expect(result.rows).toEqual([{ stage: 'applied', cv_label: '', notes: '', cv_document_id: null }]);
    for (const stage of ['interview', 'offer', 'rejected', 'withdrawn']) {
      await db.exec(`update public.applications set stage = '${stage}'`);
    }
  });

  it('rejects an unknown stage', async () => {
    expect((await rejection(insertApplication('ghosted'))).message).toContain('applications_stage_check');
  });

  it('allows one application per (user, job)', async () => {
    await insertApplication();
    expect((await rejection(insertApplication())).message).toContain('applications_user_job_key');
  });

  it('is removed together with its job', async () => {
    await insertApplication();
    await db.exec(`delete from public.jobs`);
    expect((await db.query('select 1 from public.applications')).rows).toEqual([]);
  });

  it('nulls both document references when the documents are removed and keeps the user', async () => {
    const [cv, letter] = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'];
    for (const id of [cv, letter]) {
      await db.exec(`insert into public.documents (id, user_id, kind, filename, mime, size_bytes, storage_path)
        values ('${id}', '${ALEX}', 'cv', 'f.pdf', '${PDF}', 10, '${ALEX}/${id}/f.pdf')`);
    }
    await db.exec(`insert into public.applications (user_id, job_id, cv_document_id, letter_document_id, cv_label)
      values ('${ALEX}', 'job-1', '${cv}', '${letter}', 'CV v1')`);
    await db.exec('delete from public.documents');
    const result = await db.query(
      `select user_id, cv_document_id, letter_document_id, cv_label from public.applications`,
    );
    expect(result.rows).toEqual([{ user_id: ALEX, cv_document_id: null, letter_document_id: null, cv_label: 'CV v1' }]);
  });
});

describe('profiles', () => {
  it('defaults to an empty CV and the contract search settings', async () => {
    await db.exec(`insert into public.profiles (user_id) values ('${ALEX}')`);
    const result = await db.query<{ cv: { skills: { has: string[] } }; search_settings: { cities: string[] } }>(
      'select cv, search_settings from public.profiles',
    );
    expect(result.rows[0].cv.skills.has).toEqual([]);
    expect(result.rows[0].search_settings.cities).toEqual(['Amsterdam', 'Rotterdam', 'Den Haag']);
  });

  it('only stores JSON objects', async () => {
    const error = await rejection(db.exec(`insert into public.profiles (user_id, cv) values ('${ALEX}', '[]')`));
    expect(error.message).toContain('profiles_cv_is_object');
    const settings = await rejection(
      db.exec(`insert into public.profiles (user_id, search_settings) values ('${ALEX}', '1')`),
    );
    expect(settings.message).toContain('profiles_search_settings_is_object');
  });

  it('is one row per user', async () => {
    await db.exec(`insert into public.profiles (user_id) values ('${ALEX}')`);
    expect((await rejection(db.exec(`insert into public.profiles (user_id) values ('${ALEX}')`))).message).toContain(
      'profiles_pkey',
    );
  });
});

describe('updated_at triggers', () => {
  const OLD = '2000-01-01T00:00:00Z';
  const staleCases = [
    {
      table: 'profiles',
      seed: `insert into public.profiles (user_id, updated_at) values ('${ALEX}', '${OLD}')`,
      set: `headline = 'x'`,
    },
    {
      table: 'jobs',
      seed: `insert into public.jobs (user_id, id, title, company, source, updated_at) values ('${ALEX}', 'job-1', 't', 'c', 'manual', '${OLD}')`,
      set: `title = 'x'`,
    },
    {
      table: 'applications',
      seed: `insert into public.jobs (user_id, id, title, company, source) values ('${ALEX}', 'job-1', 't', 'c', 'manual');
             insert into public.applications (user_id, job_id, updated_at) values ('${ALEX}', 'job-1', '${OLD}')`,
      set: `notes = 'x'`,
    },
  ];

  it.each(staleCases)('refreshes updated_at on $table', async ({ table, seed, set }) => {
    await db.exec(seed);
    await db.exec(`update public.${table} set ${set}`);
    const result = await db.query<{ stale: boolean }>(
      `select updated_at <= '${OLD}'::timestamptz as stale from public.${table}`,
    );
    expect(result.rows).toEqual([{ stale: false }]);
  });
});

describe('account deletion', () => {
  it('cascades to every table when the auth user is deleted', async () => {
    const extra = '30000000-0000-4000-8000-0000000000c3';
    await db.exec(`insert into auth.users (id, email) values ('${extra}', 'casey@example.com');
      insert into public.profiles (user_id) values ('${extra}');
      ${jobSql(extra, 'job-1')};
      insert into public.documents (user_id, kind, filename, mime, size_bytes, storage_path)
        values ('${extra}', 'cv', 'f.pdf', '${PDF}', 10, '${extra}/d/f.pdf');
      insert into public.applications (user_id, job_id) values ('${extra}', 'job-1')`);
    await db.exec(`delete from auth.users where id = '${extra}'`);
    for (const table of ['profiles', 'jobs', 'documents', 'applications']) {
      expect((await db.query(`select 1 from public.${table}`)).rows).toEqual([]);
    }
  });
});

describe('structure', () => {
  it('has the contract indexes', async () => {
    const result = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname`,
    );
    const defs = Object.fromEntries(result.rows.map((row) => [row.indexname, row.indexdef]));
    expect(defs.jobs_user_status_first_seen_idx).toContain('(user_id, status, first_seen_at DESC)');
    expect(defs.applications_user_applied_at_idx).toContain('(user_id, applied_at DESC)');
    expect(defs.documents_user_kind_idx).toContain('(user_id, kind)');
    expect(defs.documents_expires_at_idx).toContain('WHERE (expires_at IS NOT NULL)');
  });

  it('can be applied twice (idempotent)', async () => {
    await runMigrations(db);
    const policies = await db.query(`select 1 from pg_policies where schemaname in ('public', 'storage')`);
    expect(policies.rows).toHaveLength(20);
  });

  it('lets an authenticated user read their own job', async () => {
    await db.exec(jobSql(ALEX, 'job-1'));
    const result = await asUser(db, ALEX, () => db.query('select id from public.jobs'));
    expect(result.rows).toEqual([{ id: 'job-1' }]);
  });
});
