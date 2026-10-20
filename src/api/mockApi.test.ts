import type { DataApi } from './dataApi';
import { createMockApi } from './mockApi';
import { ADMIN_EMAIL, ALEX_EMAIL } from './mockSeed';
import type { ApiError, ApplyInput, ManualJobInput, Profile, ProfileInput } from './types';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const TEMP_VALUE = 'temp-value';
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALEX_JOB_APPLIED = 'f336e9aa5cc2f9ec';
const ALEX_JOB_NEW = '7668781b05b7b63f';

function setup(): { api: DataApi; urls: Blob[] } {
  let counter = 0;
  const urls: Blob[] = [];
  const api = createMockApi({
    now: () => NOW,
    newId: () => `id-${++counter}`,
    createObjectUrl: (blob) => {
      urls.push(blob);
      return `blob:mock/${urls.length}`;
    },
  });
  return { api, urls };
}

async function signedIn(email = ALEX_EMAIL): Promise<DataApi> {
  const { api } = setup();
  await api.auth.signIn(email, 'any-input');
  return api;
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected the promise to reject');
}

function file(name: string, type: string, size = 10): File {
  const created = new File(['x'], name, { type });
  Object.defineProperty(created, 'size', { value: size });
  return created;
}

const manual: ManualJobInput = { title: 'QA Lead', company: 'Acme Analytics', location: 'Utrecht', description: 'Fictional.' };

describe('seed data', () => {
  it('has a realistic spread for Alex', async () => {
    const api = await signedIn();
    const jobs = await api.jobs.list();
    expect(jobs).toHaveLength(12);
    expect(new Set(jobs.map((job) => job.status))).toEqual(new Set(['new', 'applied', 'skipped']));
    expect(new Set(jobs.map((job) => job.fit)).size).toBeGreaterThanOrEqual(5);
    const ages = jobs.map((job) => (NOW.getTime() - Date.parse(job.firstSeenAt)) / 86_400_000);
    expect(Math.min(...ages)).toBeLessThan(7);
    expect(Math.max(...ages)).toBeGreaterThan(120);
    expect(jobs.filter((job) => job.source === 'manual')).toHaveLength(2);
    const noPostedAt = jobs.find((job) => job.id === 'ac701b87eeaeacc6');
    expect(noPostedAt && 'postedAt' in noPostedAt).toBe(false);
  });

  it('has applications, a structured CV profile and documents', async () => {
    const api = await signedIn();
    const applications = await api.applications.list();
    expect(applications.map((application) => application.stage)).toEqual(['interview', 'applied', 'rejected', 'withdrawn']);
    expect(applications.some((application) => application.cvLabel !== '' && application.cvDocumentId === null)).toBe(true);
    const jobs = await api.jobs.list({ status: 'applied' });
    expect(jobs.map((job) => job.id).toSorted()).toEqual(applications.map((application) => application.jobId).toSorted());

    const profile = await api.profile.get();
    expect(profile?.displayName).toBe('Alex Example');
    expect(profile?.cv.experience.length).toBeGreaterThan(0);
    expect(profile?.cv.contact.email).toBe(ALEX_EMAIL);

    const documents = await api.documents.list();
    expect(documents.map((doc) => doc.kind).toSorted()).toEqual(['cv', 'cv', 'letter', 'template']);
    expect(documents.filter((doc) => doc.expiresAt !== null && Date.parse(doc.expiresAt) < NOW.getTime())).toHaveLength(1);
    expect(documents.find((doc) => doc.kind === 'template')?.expiresAt).toBeNull();
    const withDocs = applications.filter((application) => application.cvDocumentId !== null);
    for (const application of withDocs) expect(documents.some((doc) => doc.id === application.cvDocumentId)).toBe(true);
  });

  it('lists two users for the admin', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    const users = await api.admin.listUsers();
    expect(users.map((user) => [user.email, user.role])).toEqual([
      [ADMIN_EMAIL, 'admin'],
      [ALEX_EMAIL, 'user'],
    ]);
    expect(users[0]).not.toHaveProperty('mustChangePassword');
  });
});

describe('auth', () => {
  it('starts signed out and signs in demo users', async () => {
    const { api } = setup();
    await expect(api.auth.getSession()).resolves.toBeNull();
    await expect(api.auth.signIn(' Alex@Example.com ', 'whatever')).resolves.toEqual({
      userId: 'user-alex',
      email: ALEX_EMAIL,
      role: 'user',
      mustChangePassword: false,
    });
    await expect(api.auth.getSession()).resolves.toMatchObject({ email: ALEX_EMAIL });
    await expect(api.auth.signIn(ADMIN_EMAIL, 'x')).resolves.toMatchObject({ role: 'admin' });
    const users = await api.admin.listUsers();
    expect(users.find((user) => user.email === ADMIN_EMAIL)?.lastSignInAt).toBe(NOW.toISOString());
  });

  it('rejects empty input, unknown users and banned users', async () => {
    const { api } = setup();
    expect((await rejection(api.auth.signIn('', 'x'))).code).toBe('validation');
    expect((await rejection(api.auth.signIn(ALEX_EMAIL, ''))).code).toBe('validation');
    expect((await rejection(api.auth.signIn('nobody@example.com', 'x'))).code).toBe('unauthenticated');
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    await api.admin.setBanned('user-alex', true);
    await api.auth.signOut();
    expect((await rejection(api.auth.signIn(ALEX_EMAIL, 'x'))).code).toBe('forbidden');
  });

  it('notifies subscribers on sign-in, sign-out and password change until unsubscribed', async () => {
    const { api } = setup();
    const events: (string | null)[] = [];
    const unsubscribe = api.auth.onAuthChange((session) => events.push(session?.email ?? null));
    await api.auth.signIn(ALEX_EMAIL, 'x');
    await api.auth.changePassword('new-value');
    await api.auth.signOut();
    unsubscribe();
    await api.auth.signIn(ALEX_EMAIL, 'x');
    expect(events).toEqual([ALEX_EMAIL, ALEX_EMAIL, null]);
  });

  it('changes the password and clears mustChangePassword', async () => {
    const { api } = setup();
    await expect(rejection(api.auth.changePassword('x'))).resolves.toMatchObject({ code: 'unauthenticated' });
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    await api.admin.createUser({ email: 'Sam@Example.com', tempPassword: TEMP_VALUE, role: 'user' });
    await api.auth.signOut();
    await expect(api.auth.signIn('sam@example.com', TEMP_VALUE)).resolves.toMatchObject({ mustChangePassword: true });
    expect((await rejection(api.auth.changePassword(''))).code).toBe('validation');
    await api.auth.changePassword('a-new-value');
    await expect(api.auth.getSession()).resolves.toMatchObject({ mustChangePassword: false });
  });

  it('deletes the account with all its data and signs out', async () => {
    const { api } = setup();
    await api.auth.signIn(ALEX_EMAIL, 'x');
    const events: (string | null)[] = [];
    api.auth.onAuthChange((session) => events.push(session?.email ?? null));
    await api.auth.deleteMyAccount();
    expect(events).toEqual([null]);
    await expect(api.auth.getSession()).resolves.toBeNull();
    expect((await rejection(api.auth.signIn(ALEX_EMAIL, 'x'))).code).toBe('unauthenticated');
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    const users = await api.admin.listUsers();
    expect(users.map((user) => user.email)).toEqual([ADMIN_EMAIL]);
  });

  it('refuses to delete the last admin but allows it when another admin exists', async () => {
    const { api } = setup();
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    expect((await rejection(api.auth.deleteMyAccount())).code).toBe('forbidden');
    const second = await api.admin.createUser({ email: 'second@example.com', role: 'admin' });
    await api.admin.setBanned(second.id, true);
    expect((await rejection(api.auth.deleteMyAccount())).code).toBe('forbidden');
    await api.admin.setBanned(second.id, false);
    await expect(api.auth.deleteMyAccount()).resolves.toBeUndefined();
  });

  it('exports the data of the caller as a JSON blob', async () => {
    const api = await signedIn();
    const blob = await api.auth.exportMyData();
    expect(blob.type).toBe('application/json');
    const data = JSON.parse(await blob.text()) as Record<string, unknown[]>;
    expect(Object.keys(data)).toEqual(['profile', 'jobs', 'applications', 'documents']);
    expect(data.jobs).toHaveLength(12);
    expect(data.documents).toHaveLength(4);

    await api.auth.signOut();
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    const adminData = JSON.parse(await (await api.auth.exportMyData()).text()) as { profile: unknown; jobs: unknown[] };
    expect(adminData.profile).toBeNull();
    expect(adminData.jobs).toEqual([]);
  });
});

describe('signed-out calls', () => {
  it('reject with unauthenticated', async () => {
    const { api } = setup();
    const input: ApplyInput = { jobId: 'x', cvDocumentId: null, letterDocumentId: null, cvLabel: '', notes: '' };
    const calls = [
      api.auth.changePassword('x'),
      api.auth.deleteMyAccount(),
      api.auth.exportMyData(),
      api.jobs.list(),
      api.jobs.get('x'),
      api.jobs.setStatus('x', 'new'),
      api.jobs.addManual(manual),
      api.applications.list(),
      api.applications.apply(input),
      api.applications.update('x', {}),
      api.applications.remove('x'),
      api.profile.get(),
      api.profile.save({} as ProfileInput),
      api.documents.list(),
      api.documents.upload(file('a.pdf', PDF), { kind: 'cv' }),
      api.documents.signedUrl('x'),
      api.documents.remove('x'),
      api.admin.listUsers(),
      api.admin.createUser({ email: 'a@example.com', role: 'user' }),
      api.admin.setRole('x', 'user'),
      api.admin.setBanned('x', true),
      api.admin.deleteUser('x'),
    ];
    for (const call of calls) expect((await rejection(call)).code).toBe('unauthenticated');
  });

  it('still serves the standard template', async () => {
    const { api } = setup();
    await expect(api.documents.standardTemplates()).resolves.toHaveLength(1);
  });
});

describe('jobs', () => {
  it('lists newest first and filters by status', async () => {
    const api = await signedIn();
    const all = await api.jobs.list();
    expect(all.map((job) => job.firstSeenAt)).toEqual(all.map((job) => job.firstSeenAt).toSorted().toReversed());
    const applied = await api.jobs.list({ status: 'applied' });
    expect(applied).toHaveLength(4);
    expect(applied.every((job) => job.status === 'applied')).toBe(true);
  });

  it('filters since/until inclusively on firstSeenAt', async () => {
    const api = await signedIn();
    const all = await api.jobs.list();
    const [newest, second, , , fifth] = all;
    const window = await api.jobs.list({ since: fifth.firstSeenAt, until: second.firstSeenAt });
    expect(window.map((job) => job.id)).toEqual(all.slice(1, 5).map((job) => job.id));
    expect(await api.jobs.list({ since: newest.firstSeenAt })).toHaveLength(1);
    expect(await api.jobs.list({ until: fifth.firstSeenAt })).toHaveLength(all.length - 4);
  });

  it('searches title, company and location case-insensitively', async () => {
    const api = await signedIn();
    expect((await api.jobs.list({ search: 'POLDER' })).map((job) => job.company)).toEqual(['Polder Payments']);
    expect((await api.jobs.list({ search: ' den haag ' })).map((job) => job.location)).toEqual(['Den Haag', 'Den Haag']);
    expect((await api.jobs.list({ search: 'site reliability' })).map((job) => job.title)).toEqual(['Site Reliability Engineer']);
    expect(await api.jobs.list({ search: 'no such thing' })).toEqual([]);
    expect(await api.jobs.list({ search: '   ' })).toHaveLength(12);
  });

  it('rejects invalid date bounds with validation', async () => {
    const api = await signedIn();
    expect((await rejection(api.jobs.list({ since: 'soon' }))).code).toBe('validation');
    expect((await rejection(api.jobs.list({ until: 'later' }))).code).toBe('validation');
  });

  it('gets a job, returns copies and rejects unknown ids with not_found', async () => {
    const api = await signedIn();
    const job = await api.jobs.get(ALEX_JOB_NEW);
    job.title = 'Changed locally';
    expect((await api.jobs.get(ALEX_JOB_NEW)).title).toBe('Senior Backend Engineer');
    expect((await rejection(api.jobs.get('missing'))).code).toBe('not_found');
  });

  it('sets the status', async () => {
    const api = await signedIn();
    await expect(api.jobs.setStatus(ALEX_JOB_NEW, 'skipped')).resolves.toMatchObject({ id: ALEX_JOB_NEW, status: 'skipped' });
    expect((await api.jobs.get(ALEX_JOB_NEW)).status).toBe('skipped');
    expect((await rejection(api.jobs.setStatus('missing', 'new'))).code).toBe('not_found');
  });

  it('adds manual jobs with the contract defaults', async () => {
    const api = await signedIn();
    const job = await api.jobs.addManual(manual);
    expect(job).toMatchObject({
      userId: 'user-alex',
      source: 'manual',
      status: 'new',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      language: 'unknown',
      url: null,
      firstSeenAt: NOW.toISOString(),
      recommendedDocumentIds: [],
    });
    expect(job.id).toMatch(/^[0-9a-f]{16}$/);
    expect(job).not.toHaveProperty('postedAt');
    expect((await api.jobs.list())[0].id).toBe(job.id);
  });

  it('rejects a duplicate manual job (even with different casing/legal form) and invalid input', async () => {
    const api = await signedIn();
    await api.jobs.addManual(manual);
    expect((await rejection(api.jobs.addManual({ ...manual, company: 'ACME analytics B.V.', title: 'qa lead' }))).code).toBe('conflict');
    expect((await rejection(api.jobs.addManual({ ...manual, title: '' }))).code).toBe('validation');
    const seeded = await api.jobs.get('3346b5e6f421ab83');
    const duplicate = { ...manual, company: seeded.company, title: seeded.title, location: seeded.location };
    expect((await rejection(api.jobs.addManual(duplicate))).code).toBe('conflict');
  });

  it('isolates the data of each user', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    expect(await api.jobs.list()).toEqual([]);
    expect((await rejection(api.jobs.get(ALEX_JOB_NEW))).code).toBe('not_found');
    await expect(api.jobs.addManual(manual)).resolves.toMatchObject({ userId: 'user-admin' });
  });
});

describe('applications', () => {
  const input = (jobId: string, extra: Partial<ApplyInput> = {}): ApplyInput => ({
    jobId,
    cvDocumentId: null,
    letterDocumentId: null,
    cvLabel: 'Alex CV',
    notes: 'n',
    ...extra,
  });

  it('lists newest first and filters since/until inclusively', async () => {
    const api = await signedIn();
    const all = await api.applications.list();
    expect(all.map((application) => application.id)).toEqual(['app-1', 'app-2', 'app-3', 'app-4']);
    const window = await api.applications.list({ since: all[2].appliedAt, until: all[1].appliedAt });
    expect(window.map((application) => application.id)).toEqual(['app-2', 'app-3']);
    expect((await rejection(api.applications.list({ since: 'x' }))).code).toBe('validation');
  });

  it('applies: creates the application and marks the job applied', async () => {
    const api = await signedIn();
    const application = await api.applications.apply(
      input(ALEX_JOB_NEW, { cvDocumentId: '8f1c2a10-0000-4000-8000-000000000001', letterDocumentId: '8f1c2a10-0000-4000-8000-000000000002' }),
    );
    expect(application).toMatchObject({
      id: 'id-1',
      userId: 'user-alex',
      jobId: ALEX_JOB_NEW,
      appliedAt: NOW.toISOString(),
      stage: 'applied',
      cvLabel: 'Alex CV',
    });
    expect((await api.jobs.get(ALEX_JOB_NEW)).status).toBe('applied');
    expect((await api.applications.list())[0].id).toBe('id-1');
  });

  it('rejects a second application, unknown jobs and unknown documents', async () => {
    const api = await signedIn();
    expect((await rejection(api.applications.apply(input(ALEX_JOB_APPLIED)))).code).toBe('conflict');
    expect((await rejection(api.applications.apply(input('missing')))).code).toBe('not_found');
    expect((await rejection(api.applications.apply(input(ALEX_JOB_NEW, { cvDocumentId: 'nope' })))).code).toBe('validation');
    expect((await rejection(api.applications.apply(input(ALEX_JOB_NEW, { letterDocumentId: 'nope' })))).code).toBe('validation');
    expect((await api.jobs.get(ALEX_JOB_NEW)).status).toBe('new');
  });

  it('updates only the given fields', async () => {
    const api = await signedIn();
    const before = (await api.applications.list()).find((application) => application.id === 'app-2');
    const updated = await api.applications.update('app-2', {
      stage: 'offer',
      notes: 'Offer received',
      cvLabel: 'Alex CV v2',
      appliedAt: '2026-06-01T00:00:00.000Z',
      cvDocumentId: null,
      letterDocumentId: '8f1c2a10-0000-4000-8000-000000000002',
    });
    expect(updated).toMatchObject({
      id: 'app-2',
      jobId: before?.jobId,
      stage: 'offer',
      notes: 'Offer received',
      cvLabel: 'Alex CV v2',
      appliedAt: '2026-06-01T00:00:00.000Z',
      cvDocumentId: null,
      letterDocumentId: '8f1c2a10-0000-4000-8000-000000000002',
    });
    await expect(api.applications.update('app-2', {})).resolves.toEqual(updated);
    await expect(api.applications.update('app-2', { stage: undefined, notes: 'again' })).resolves.toMatchObject({ stage: 'offer', notes: 'again' });
  });

  it('validates updates and rejects unknown applications', async () => {
    const api = await signedIn();
    expect((await rejection(api.applications.update('missing', {}))).code).toBe('not_found');
    expect((await rejection(api.applications.update('app-2', { stage: 'hired' as never }))).code).toBe('validation');
    expect((await rejection(api.applications.update('app-2', { appliedAt: 'never' }))).code).toBe('validation');
    expect((await rejection(api.applications.update('app-2', { cvDocumentId: 'nope' }))).code).toBe('validation');
  });

  it('removes an application and sets an applied job back to new', async () => {
    const api = await signedIn();
    await api.applications.remove('app-1');
    expect((await api.jobs.get(ALEX_JOB_APPLIED)).status).toBe('new');
    expect((await api.applications.list()).map((application) => application.id)).toEqual(['app-2', 'app-3', 'app-4']);
    expect((await rejection(api.applications.remove('app-1'))).code).toBe('not_found');
  });

  it('keeps a non-applied job status when removing the application', async () => {
    const api = await signedIn();
    await api.jobs.setStatus(ALEX_JOB_APPLIED, 'skipped');
    await api.applications.remove('app-1');
    expect((await api.jobs.get(ALEX_JOB_APPLIED)).status).toBe('skipped');
  });
});

describe('profile', () => {
  const toInput = (profile: Profile | null): ProfileInput => {
    if (profile === null) throw new Error('expected a profile');
    return { displayName: profile.displayName, headline: profile.headline, summary: profile.summary, cv: profile.cv, searchSettings: profile.searchSettings };
  };

  it('saves the profile for the caller and replaces the previous one', async () => {
    const api = await signedIn();
    const input = toInput(await api.profile.get());
    const saved = await api.profile.save({ ...input, headline: 'New headline' });
    expect(saved).toMatchObject({ userId: 'user-alex', headline: 'New headline', updatedAt: NOW.toISOString() });
    await expect(api.profile.get()).resolves.toEqual(saved);
    input.cv.contact.name = 'mutated locally';
    expect((await api.profile.get())?.cv.contact.name).toBe('Alex Example');
  });

  it('is null before the first save', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    await expect(api.profile.get()).resolves.toBeNull();
    const input = toInput(await (await signedIn()).profile.get());
    await expect(api.profile.save(input)).resolves.toMatchObject({ userId: 'user-admin' });
    await expect(api.profile.get()).resolves.toMatchObject({ userId: 'user-admin' });
  });
});

describe('documents', () => {
  it('lists newest first and filters by kind', async () => {
    const api = await signedIn();
    const all = await api.documents.list();
    expect(all.map((doc) => doc.filename)).toEqual(['alex-cv-java.pdf', 'alex-letter-dijk-data.docx', 'alex-base-cv.pdf', 'alex-cv-2025.pdf']);
    expect((await api.documents.list({ kind: 'cv' })).map((doc) => doc.kind)).toEqual(['cv', 'cv']);
  });

  it('uploads cv/letter with a 6 month expiry and templates without one', async () => {
    const api = await signedIn();
    const cv = await api.documents.upload(file('My CV.pdf', PDF, 2048), { kind: 'cv', jobId: ALEX_JOB_NEW });
    expect(cv).toEqual({
      id: 'id-1',
      userId: 'user-alex',
      jobId: ALEX_JOB_NEW,
      kind: 'cv',
      filename: 'My CV.pdf',
      mime: PDF,
      sizeBytes: 2048,
      storagePath: 'user-alex/id-1/My_CV.pdf',
      createdAt: NOW.toISOString(),
      expiresAt: '2026-12-15T12:00:00.000Z',
    });
    const letter = await api.documents.upload(file('letter.docx', DOCX), { kind: 'letter' });
    expect(letter).toMatchObject({ jobId: null, expiresAt: '2026-12-15T12:00:00.000Z' });
    const template = await api.documents.upload(file('base.pdf', PDF), { kind: 'template' });
    expect(template.expiresAt).toBeNull();
  });

  it('rejects the 4th template with template_limit but still accepts other kinds', async () => {
    const api = await signedIn();
    await api.documents.upload(file('t2.pdf', PDF), { kind: 'template' });
    await api.documents.upload(file('t3.pdf', PDF), { kind: 'template' });
    expect((await rejection(api.documents.upload(file('t4.pdf', PDF), { kind: 'template' }))).code).toBe('template_limit');
    await expect(api.documents.upload(file('cv.pdf', PDF), { kind: 'cv' })).resolves.toMatchObject({ kind: 'cv' });
    const templateId = (await api.documents.list({ kind: 'template' }))[0].id;
    await api.documents.remove(templateId);
    await expect(api.documents.upload(file('t4.pdf', PDF), { kind: 'template' })).resolves.toMatchObject({ kind: 'template' });
  });

  it('rejects bad mime types and files over 10 MB with validation', async () => {
    const api = await signedIn();
    expect((await rejection(api.documents.upload(file('a.png', 'image/png'), { kind: 'cv' }))).code).toBe('validation');
    expect((await rejection(api.documents.upload(file('big.pdf', PDF, 10_485_761), { kind: 'cv' }))).code).toBe('validation');
    await expect(api.documents.upload(file('max.pdf', PDF, 10_485_760), { kind: 'cv' })).resolves.toBeDefined();
  });

  it('returns a signed URL for a document and not_found otherwise', async () => {
    const { api, urls } = setup();
    await api.auth.signIn(ALEX_EMAIL, 'x');
    await expect(api.documents.signedUrl('8f1c2a10-0000-4000-8000-000000000001')).resolves.toBe('blob:mock/1');
    expect(urls[0].type).toBe(PDF);
    expect(await urls[0].text()).toContain('alex-cv-java.pdf');
    const upload = file('mine.pdf', PDF);
    const meta = await api.documents.upload(upload, { kind: 'cv' });
    await api.documents.signedUrl(meta.id);
    expect(urls[1]).toBe(upload);
    expect((await rejection(api.documents.signedUrl('missing'))).code).toBe('not_found');
  });

  it('removes a document and clears it from applications', async () => {
    const api = await signedIn();
    await api.documents.remove('8f1c2a10-0000-4000-8000-000000000001');
    expect((await api.documents.list()).map((doc) => doc.id)).not.toContain('8f1c2a10-0000-4000-8000-000000000001');
    const applications = await api.applications.list();
    expect(applications.find((application) => application.id === 'app-1')).toMatchObject({ cvDocumentId: null, letterDocumentId: '8f1c2a10-0000-4000-8000-000000000002' });
    await api.documents.remove('8f1c2a10-0000-4000-8000-000000000002');
    expect((await api.applications.list()).find((application) => application.id === 'app-1')?.letterDocumentId).toBeNull();
    expect((await rejection(api.documents.remove('8f1c2a10-0000-4000-8000-000000000001'))).code).toBe('not_found');
  });

  it('exposes the standard template', async () => {
    const api = await signedIn();
    const [template] = await api.documents.standardTemplates();
    expect(template.pdfUrl.endsWith('templates/standard-cv-template.pdf')).toBe(true);
  });
});

describe('admin', () => {
  it('is forbidden for regular users', async () => {
    const api = await signedIn();
    const calls = [
      api.admin.listUsers(),
      api.admin.createUser({ email: 'a@example.com', role: 'user' }),
      api.admin.setRole('user-admin', 'user'),
      api.admin.setBanned('user-admin', true),
      api.admin.deleteUser('user-admin'),
    ];
    for (const call of calls) expect((await rejection(call)).code).toBe('forbidden');
  });

  it('creates users with and without a temporary password', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    const created = await api.admin.createUser({ email: 'New.User@Example.com', tempPassword: TEMP_VALUE, role: 'user' });
    expect(created).toEqual({
      id: 'id-1',
      email: 'new.user@example.com',
      role: 'user',
      createdAt: NOW.toISOString(),
      lastSignInAt: null,
      banned: false,
    });
    await expect(api.admin.createUser({ email: 'invited@example.com', role: 'admin' })).resolves.toMatchObject({ role: 'admin' });
    expect((await api.admin.listUsers()).map((user) => user.email)).toContain('invited@example.com');
  });

  it('validates new users', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    for (const email of ['', 'no-at-sign', '@example.com', 'someone@']) {
      expect((await rejection(api.admin.createUser({ email, role: 'user' }))).code).toBe('validation');
    }
    expect((await rejection(api.admin.createUser({ email: 'a@example.com', tempPassword: '', role: 'user' }))).code).toBe('validation');
    expect((await rejection(api.admin.createUser({ email: ALEX_EMAIL.toUpperCase(), role: 'user' }))).code).toBe('conflict');
  });

  it('changes roles and bans users, but never the caller', async () => {
    const api = await signedIn(ADMIN_EMAIL);
    await expect(api.admin.setRole('user-alex', 'admin')).resolves.toMatchObject({ id: 'user-alex', role: 'admin' });
    await expect(api.admin.setBanned('user-alex', true)).resolves.toMatchObject({ banned: true });
    await expect(api.admin.setBanned('user-alex', false)).resolves.toMatchObject({ banned: false });
    expect((await rejection(api.admin.setRole('user-admin', 'user'))).code).toBe('forbidden');
    expect((await rejection(api.admin.setBanned('user-admin', true))).code).toBe('forbidden');
    expect((await rejection(api.admin.deleteUser('user-admin'))).code).toBe('forbidden');
    expect((await rejection(api.admin.setRole('missing', 'user'))).code).toBe('not_found');
    expect((await rejection(api.admin.setBanned('missing', true))).code).toBe('not_found');
    expect((await rejection(api.admin.deleteUser('missing'))).code).toBe('not_found');
  });

  it('deletes a user together with all their data', async () => {
    const { api } = setup();
    await api.auth.signIn(ADMIN_EMAIL, 'x');
    await api.admin.deleteUser('user-alex');
    expect((await api.admin.listUsers()).map((user) => user.id)).toEqual(['user-admin']);
    await api.auth.signOut();
    expect((await rejection(api.auth.signIn(ALEX_EMAIL, 'x'))).code).toBe('unauthenticated');
  });
});

describe('defaults', () => {
  it('uses the real clock, crypto.randomUUID and URL.createObjectURL when no options are given', async () => {
    const createObjectURL = vi.fn(() => 'blob:default');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }));
    const api = createMockApi();
    await api.auth.signIn(ALEX_EMAIL, 'x');
    const application = await api.applications.apply({ jobId: ALEX_JOB_NEW, cvDocumentId: null, letterDocumentId: null, cvLabel: '', notes: '' });
    expect(application.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(Date.now() - Date.parse(application.appliedAt))).toBeLessThan(5000);
    await expect(api.documents.signedUrl('8f1c2a10-0000-4000-8000-000000000001')).resolves.toBe('blob:default');
    vi.unstubAllGlobals();
  });
});
