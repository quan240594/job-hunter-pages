import { createFakeSupabase, failure, ok, opArgs, opNames } from './__fixtures__/fakeSupabase';
import { APPLICATION_ROW, JOB_ROW } from './__fixtures__/rows';
import { buildApplications, buildJobs, searchFilter } from './supabaseJobs';

function setupJobs() {
  const fake = createFakeSupabase();
  return { fake, jobs: buildJobs(fake.client) };
}

function setupApplications() {
  const fake = createFakeSupabase();
  return { fake, applications: buildApplications(fake.client) };
}

describe('searchFilter', () => {
  it('searches title, company and location with a quoted ilike pattern', () => {
    expect(searchFilter('java')).toBe('title.ilike."%java%",company.ilike."%java%",location.ilike."%java%"');
  });

  it('escapes LIKE wildcards and the filter grammar', () => {
    expect(searchFilter('a,b)"c%d_e\\')).toBe(
      ['title', 'company', 'location'].map((column) => `${column}.ilike."%a,b)\\"c\\\\%d\\\\_e\\\\\\\\%"`).join(','),
    );
  });
});

describe('jobs.list', () => {
  it('selects newest first and maps rows', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok([JOB_ROW]));
    const result = await jobs.list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'abcdef0123456789', userId: 'u1', firstSeenAt: '2026-05-02T00:00:00+00:00' });
    expect(fake.queries[0].table).toBe('jobs');
    expect(opNames(fake.queries[0])).toEqual(['select', 'order']);
    expect(opArgs(fake.queries[0], 'order')).toEqual(['first_seen_at', { ascending: false }]);
  });

  it('applies status, since, until and search filters', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok([]));
    await jobs.list({ status: 'applied', since: '2026-01-01', until: '2026-02-01', search: ' java ' });
    const query = fake.queries[0];
    expect(opNames(query)).toEqual(['select', 'eq', 'gte', 'lte', 'or', 'order']);
    expect(opArgs(query, 'eq')).toEqual(['status', 'applied']);
    expect(opArgs(query, 'gte')).toEqual(['first_seen_at', '2026-01-01']);
    expect(opArgs(query, 'lte')).toEqual(['first_seen_at', '2026-02-01']);
    expect(opArgs(query, 'or')).toEqual([searchFilter('java')]);
  });

  it('ignores a blank search', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok([]));
    await jobs.list({ search: '   ' });
    expect(opNames(fake.queries[0])).toEqual(['select', 'order']);
  });

  it('maps errors and malformed responses', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(failure({ code: 'PGRST301', message: 'JWT expired' }), ok(null), ok([{ ...JOB_ROW, status: 'bogus' }]));
    await expect(jobs.list()).rejects.toEqual({ code: 'unauthenticated', message: 'JWT expired' });
    await expect(jobs.list()).rejects.toMatchObject({ code: 'unknown' });
    await expect(jobs.list()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('jobs.get / setStatus', () => {
  it('gets one job by id', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok(JOB_ROW));
    await expect(jobs.get('abcdef0123456789')).resolves.toMatchObject({ id: 'abcdef0123456789' });
    expect(opNames(fake.queries[0])).toEqual(['select', 'eq', 'maybeSingle']);
    expect(opArgs(fake.queries[0], 'eq')).toEqual(['id', 'abcdef0123456789']);
  });

  it('rejects with not_found when the row is missing or hidden by RLS', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok(null), ok(null));
    await expect(jobs.get('x')).rejects.toEqual({ code: 'not_found', message: 'Job not found.' });
    await expect(jobs.setStatus('x', 'skipped')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('updates the status and returns the new row', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok({ ...JOB_ROW, status: 'skipped' }));
    await expect(jobs.setStatus('abcdef0123456789', 'skipped')).resolves.toMatchObject({ status: 'skipped' });
    expect(opNames(fake.queries[0])).toEqual(['update', 'eq', 'select', 'maybeSingle']);
    expect(opArgs(fake.queries[0], 'update')).toEqual([{ status: 'skipped' }]);
  });
});

describe('jobs.addManual', () => {
  const input = { title: ' QA Lead ', company: 'Acme B.V.', location: 'Utrecht', description: 'd' };

  it('inserts a row with the computed id for the signed-in user', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(ok({ ...JOB_ROW, source: 'manual' }));
    await expect(jobs.addManual(input)).resolves.toMatchObject({ source: 'manual' });
    const [row] = opArgs(fake.queries[0], 'insert') as [Record<string, unknown>];
    expect(row).toMatchObject({
      user_id: 'u1',
      title: 'QA Lead',
      company: 'Acme B.V.',
      location: 'Utrecht',
      source: 'manual',
      status: 'new',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      language: 'unknown',
      url: null,
      posted_at: null,
      hybrid_quote: null,
    });
    expect(row.id).toMatch(/^[0-9a-f]{16}$/);
    expect(opNames(fake.queries[0])).toEqual(['insert', 'select', 'single']);
  });

  it('maps a duplicate to conflict, validates first and needs a session', async () => {
    const { fake, jobs } = setupJobs();
    fake.respond(failure({ code: '23505', message: 'duplicate key value violates unique constraint "jobs_pkey"' }));
    await expect(jobs.addManual(input)).rejects.toMatchObject({ code: 'conflict' });
    await expect(jobs.addManual({ ...input, title: '' })).rejects.toMatchObject({ code: 'validation' });
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(jobs.addManual(input)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(fake.queries).toHaveLength(1);
  });
});

describe('applications.list', () => {
  it('orders by applied_at descending and filters since/until', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok([APPLICATION_ROW]), ok([]));
    await expect(applications.list()).resolves.toMatchObject([{ id: 'a1', stage: 'interview', jobId: 'abcdef0123456789' }]);
    expect(opNames(fake.queries[0])).toEqual(['select', 'order']);
    expect(opArgs(fake.queries[0], 'order')).toEqual(['applied_at', { ascending: false }]);
    await applications.list({ since: '2026-01-01', until: '2026-02-01' });
    expect(opNames(fake.queries[1])).toEqual(['select', 'gte', 'lte', 'order']);
    expect(opArgs(fake.queries[1], 'gte')).toEqual(['applied_at', '2026-01-01']);
    expect(opArgs(fake.queries[1], 'lte')).toEqual(['applied_at', '2026-02-01']);
  });
});

describe('applications.apply', () => {
  const input = { jobId: 'abcdef0123456789', cvDocumentId: 'd1', letterDocumentId: null, cvLabel: 'CV', notes: 'n' };

  it('inserts the application and sets the job to applied', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok({ id: input.jobId }), ok(APPLICATION_ROW), { data: null, error: null });
    await expect(applications.apply(input)).resolves.toMatchObject({ id: 'a1', stage: 'interview' });
    expect(fake.queries.map((query) => [query.table, ...opNames(query)])).toEqual([
      ['jobs', 'select', 'eq', 'maybeSingle'],
      ['applications', 'insert', 'select', 'single'],
      ['jobs', 'update', 'eq'],
    ]);
    expect(opArgs(fake.queries[1], 'insert')).toEqual([
      {
        user_id: 'u1',
        job_id: input.jobId,
        cv_document_id: 'd1',
        letter_document_id: null,
        cv_label: 'CV',
        notes: 'n',
        stage: 'applied',
      },
    ]);
    expect(opArgs(fake.queries[2], 'update')).toEqual([{ status: 'applied' }]);
  });

  it('rejects an unknown job without writing anything', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok(null));
    await expect(applications.apply(input)).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.queries).toHaveLength(1);
  });

  it('maps a second application to conflict and bad documents to validation', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(
      ok({ id: input.jobId }),
      failure({ code: '23505', message: 'duplicate key' }),
      ok({ id: input.jobId }),
      failure({ code: '23503', message: 'foreign key violation' }),
    );
    await expect(applications.apply(input)).rejects.toMatchObject({ code: 'conflict' });
    await expect(applications.apply(input)).rejects.toMatchObject({ code: 'validation' });
  });

  it('removes the application again when the job update fails', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok({ id: input.jobId }), ok(APPLICATION_ROW), failure({ code: '42501', message: 'rls' }), ok(null));
    await expect(applications.apply(input)).rejects.toMatchObject({ code: 'forbidden' });
    const rollback = fake.queries[3];
    expect([rollback.table, ...opNames(rollback)]).toEqual(['applications', 'delete', 'eq']);
    expect(opArgs(rollback, 'eq')).toEqual(['id', 'a1']);
  });
});

describe('applications.update', () => {
  it('sends only the changed columns', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok({ ...APPLICATION_ROW, stage: 'offer', notes: 'x' }));
    await expect(applications.update('a1', { stage: 'offer', notes: 'x', cvLabel: undefined })).resolves.toMatchObject({ stage: 'offer' });
    expect(opNames(fake.queries[0])).toEqual(['update', 'select', 'eq', 'maybeSingle']);
    expect(opArgs(fake.queries[0], 'update')).toEqual([{ stage: 'offer', notes: 'x' }]);
    expect(opArgs(fake.queries[0], 'eq')).toEqual(['id', 'a1']);
  });

  it('just reads the row for an empty patch', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok(APPLICATION_ROW));
    await applications.update('a1', {});
    expect(opNames(fake.queries[0])).toEqual(['select', 'eq', 'maybeSingle']);
  });

  it('rejects with not_found or the mapped error', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok(null), failure({ code: '23514', message: 'check violation' }));
    await expect(applications.update('a1', { notes: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(applications.update('a1', { notes: 'x' })).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('applications.remove', () => {
  it('deletes the application and puts an applied job back to new', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(ok({ job_id: 'abcdef0123456789' }), ok(null), ok(null));
    await expect(applications.remove('a1')).resolves.toBeUndefined();
    expect(fake.queries.map((query) => [query.table, ...opNames(query)])).toEqual([
      ['applications', 'select', 'eq', 'maybeSingle'],
      ['applications', 'delete', 'eq'],
      ['jobs', 'update', 'eq', 'eq'],
    ]);
    expect(fake.queries[2].ops.filter((op) => op.name === 'eq').map((op) => op.args)).toEqual([
      ['id', 'abcdef0123456789'],
      ['status', 'applied'],
    ]);
    expect(opArgs(fake.queries[2], 'update')).toEqual([{ status: 'new' }]);
  });

  it('rejects with not_found and maps delete/update failures', async () => {
    const { fake, applications } = setupApplications();
    fake.respond(
      ok(null),
      ok({ job_id: 'j' }),
      failure({ code: '42501', message: 'rls' }),
      ok({ job_id: 'j' }),
      ok(null),
      failure({ code: '42501', message: 'rls' }),
    );
    await expect(applications.remove('a1')).rejects.toMatchObject({ code: 'not_found' });
    await expect(applications.remove('a1')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(applications.remove('a1')).rejects.toMatchObject({ code: 'forbidden' });
  });
});
