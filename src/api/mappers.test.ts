import {
  adminUserFromJson,
  applicationFromRow,
  applicationPatchToRow,
  applicationToInsertRow,
  cvFromJson,
  documentFromRow,
  documentToInsertRow,
  jobFromRow,
  manualJobToRow,
  profileFromRow,
  profileToRow,
  searchSettingsFromJson,
  textColumn,
} from './mappers';
import type { PreparedManualJob } from './manualJob';
import type { ProfileInput } from './types';
import { APPLICATION_ROW, DOCUMENT_ROW, JOB_ROW } from './__fixtures__/rows';

describe('jobFromRow', () => {
  it('maps snake_case columns to camelCase fields', () => {
    expect(jobFromRow(JOB_ROW)).toEqual({
      id: 'abcdef0123456789',
      userId: 'u1',
      title: 'Platform Engineer',
      company: 'Acme',
      location: 'Amsterdam',
      url: 'https://jobs.example.com/1',
      source: 'greenhouse:acme',
      description: 'd',
      postedAt: '2026-05-01T00:00:00+00:00',
      firstSeenAt: '2026-05-02T00:00:00+00:00',
      status: 'new',
      fit: 4,
      category: 'A',
      hybrid: 'quoted',
      hybridQuote: 'two days',
      language: 'english',
      recommendedDocumentIds: ['d1'],
    });
  });

  it('omits null optional columns and defaults a null array', () => {
    const job = jobFromRow({ ...JOB_ROW, url: null, posted_at: null, hybrid_quote: null, recommended_document_ids: null });
    expect(job.url).toBeNull();
    expect(job).not.toHaveProperty('postedAt');
    expect(job).not.toHaveProperty('hybridQuote');
    expect(job.recommendedDocumentIds).toEqual([]);
    expect(jobFromRow({ ...JOB_ROW, url: undefined, recommended_document_ids: undefined }).url).toBeNull();
  });

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['an array', []],
    ['a missing id', { ...JOB_ROW, id: undefined }],
    ['a numeric title', { ...JOB_ROW, title: 3 }],
    ['a numeric url', { ...JOB_ROW, url: 3 }],
    ['an unknown status', { ...JOB_ROW, status: 'archived' }],
    ['an out-of-range fit', { ...JOB_ROW, fit: 6 }],
    ['a bad category', { ...JOB_ROW, category: 'Z' }],
    ['a non-array id list', { ...JOB_ROW, recommended_document_ids: 'd1' }],
    ['a mixed id list', { ...JOB_ROW, recommended_document_ids: ['d1', 2] }],
  ])('rejects %s with unknown', (_name, row) => {
    expect(() => jobFromRow(row)).toThrow(expect.objectContaining({ code: 'unknown' }));
  });

  it('does not echo response values in the error message', () => {
    expect(() => jobFromRow({ ...JOB_ROW, status: 'secret-value' })).toThrow(
      expect.objectContaining({ message: "Unexpected value for 'status' in the response." }),
    );
  });
});

describe('applicationFromRow', () => {
  it('maps the columns', () => {
    expect(applicationFromRow(APPLICATION_ROW)).toEqual({
      id: 'a1',
      userId: 'u1',
      jobId: 'abcdef0123456789',
      appliedAt: '2026-05-03T00:00:00+00:00',
      cvDocumentId: 'd1',
      letterDocumentId: null,
      cvLabel: 'CV',
      notes: 'n',
      stage: 'interview',
    });
  });

  it('rejects a bad stage', () => {
    expect(() => applicationFromRow({ ...APPLICATION_ROW, stage: 'hired' })).toThrow(expect.objectContaining({ code: 'unknown' }));
  });
});

describe('documentFromRow', () => {
  it('maps the columns', () => {
    expect(documentFromRow(DOCUMENT_ROW)).toEqual({
      id: 'd1',
      userId: 'u1',
      jobId: null,
      kind: 'cv',
      filename: 'cv.pdf',
      mime: 'application/pdf',
      sizeBytes: 1024,
      storagePath: 'u1/d1/cv.pdf',
      createdAt: '2026-05-01T00:00:00+00:00',
      expiresAt: '2026-11-01T00:00:00+00:00',
    });
    expect(documentFromRow({ ...DOCUMENT_ROW, kind: 'template', expires_at: null, job_id: 'j1' })).toMatchObject({
      kind: 'template',
      expiresAt: null,
      jobId: 'j1',
    });
  });

  it.each([
    ['an unsupported mime', { ...DOCUMENT_ROW, mime: 'text/plain' }],
    ['a string size', { ...DOCUMENT_ROW, size_bytes: '1' }],
    ['a non-finite size', { ...DOCUMENT_ROW, size_bytes: Number.POSITIVE_INFINITY }],
    ['a bad kind', { ...DOCUMENT_ROW, kind: 'photo' }],
  ])('rejects %s', (_name, row) => {
    expect(() => documentFromRow(row)).toThrow(expect.objectContaining({ code: 'unknown' }));
  });
});

describe('textColumn', () => {
  it('reads one string column', () => {
    expect(textColumn({ storage_path: 'u1/d1/a.pdf' }, 'storage_path')).toBe('u1/d1/a.pdf');
    expect(() => textColumn({ storage_path: 1 }, 'storage_path')).toThrow(expect.objectContaining({ code: 'unknown' }));
    expect(() => textColumn(null, 'storage_path')).toThrow(expect.objectContaining({ code: 'unknown' }));
  });
});

describe('adminUserFromJson', () => {
  const user = { id: 'u1', email: 'a@example.com', role: 'admin', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, banned: false };

  it('maps a user and validates the shape', () => {
    expect(adminUserFromJson(user)).toEqual(user);
    expect(adminUserFromJson({ ...user, lastSignInAt: '2026-02-01T00:00:00Z' }).lastSignInAt).toBe('2026-02-01T00:00:00Z');
    expect(() => adminUserFromJson({ ...user, banned: 'no' })).toThrow(expect.objectContaining({ code: 'unknown' }));
    expect(() => adminUserFromJson({ ...user, role: 'root' })).toThrow(expect.objectContaining({ code: 'unknown' }));
    expect(() => adminUserFromJson(null)).toThrow(expect.objectContaining({ code: 'unknown' }));
  });
});

describe('cvFromJson', () => {
  it('reads a complete CV', () => {
    const cv = {
      contact: { name: 'Alex Example', email: 'alex@example.com', phone: '1', location: 'Amsterdam' },
      experience: [{ role: 'Dev', company: 'Acme', location: 'AMS', startDate: '2020-01', endDate: null, bullets: ['a', 3] }],
      education: [{ degree: 'MSc', school: 'EU', location: 'Delft', startDate: '2015', endDate: '2017' }],
      skills: { has: ['java'], lacks: ['go'] },
      languages: [{ name: 'English', level: 'native' }],
      links: [{ label: 'Site', url: 'https://example.com' }],
    };
    expect(cvFromJson(cv)).toEqual({
      ...cv,
      experience: [{ ...cv.experience[0], bullets: ['a'] }],
    });
  });

  it('falls back to empty values for anything missing or malformed', () => {
    const empty = {
      contact: { name: '', email: '', phone: '', location: '' },
      experience: [],
      education: [],
      skills: { has: [], lacks: [] },
      languages: [],
      links: [],
    };
    expect(cvFromJson(null)).toEqual(empty);
    expect(cvFromJson('x')).toEqual(empty);
    expect(cvFromJson({ contact: 1, skills: [], experience: 'x', education: [1, null], languages: {}, links: [[]] })).toEqual(empty);
    expect(cvFromJson({ experience: [{}], education: [{}], languages: [{}], links: [{}] })).toMatchObject({
      experience: [{ role: '', endDate: null, bullets: [] }],
      education: [{ degree: '', endDate: null }],
      languages: [{ name: '', level: '' }],
      links: [{ label: '', url: '' }],
    });
  });
});

describe('searchSettingsFromJson', () => {
  it('reads valid settings', () => {
    const settings = { keywords: ['java'], cities: ['Utrecht'], remote: 'any', englishOnly: true, minSeniority: 'staff' };
    expect(searchSettingsFromJson(settings)).toEqual(settings);
    expect(searchSettingsFromJson({ ...settings, cities: [] }).cities).toEqual([]);
  });

  it('defaults the cities and everything else', () => {
    expect(searchSettingsFromJson(undefined)).toEqual({
      keywords: [],
      cities: ['Amsterdam', 'Rotterdam', 'Den Haag'],
      remote: 'hybrid-or-remote',
      englishOnly: false,
      minSeniority: 'any',
    });
    expect(searchSettingsFromJson({ remote: 'sometimes', englishOnly: 'yes', minSeniority: 'principal' })).toMatchObject({
      remote: 'hybrid-or-remote',
      englishOnly: false,
      minSeniority: 'any',
    });
    expect(searchSettingsFromJson({ minSeniority: 'mid' }).minSeniority).toBe('mid');
  });
});

describe('profileFromRow', () => {
  it('maps a profile row', () => {
    const profile = profileFromRow({
      user_id: 'u1',
      display_name: 'Alex Example',
      headline: 'h',
      summary: 's',
      cv: null,
      search_settings: null,
      updated_at: '2026-05-01T00:00:00+00:00',
    });
    expect(profile).toMatchObject({ userId: 'u1', displayName: 'Alex Example', headline: 'h', summary: 's', updatedAt: '2026-05-01T00:00:00+00:00' });
    expect(profile.cv.contact.name).toBe('');
    expect(profile.searchSettings.cities).toEqual(['Amsterdam', 'Rotterdam', 'Den Haag']);
    expect(() => profileFromRow({})).toThrow(expect.objectContaining({ code: 'unknown' }));
  });
});

describe('domain to row mappers', () => {
  it('maps a profile input', () => {
    const input: ProfileInput = {
      displayName: 'Alex Example',
      headline: 'h',
      summary: 's',
      cv: cvFromJson(null),
      searchSettings: searchSettingsFromJson(null),
    };
    expect(profileToRow('u1', input)).toEqual({
      user_id: 'u1',
      display_name: 'Alex Example',
      headline: 'h',
      summary: 's',
      cv: input.cv,
      search_settings: input.searchSettings,
    });
  });

  it('maps a manual job, using null for absent optionals', () => {
    const job: PreparedManualJob = {
      title: 'QA',
      company: 'Acme',
      location: 'Utrecht',
      url: null,
      description: 'd',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      language: 'unknown',
    };
    expect(manualJobToRow('u1', 'id1', job, 'manual')).toEqual({
      user_id: 'u1',
      id: 'id1',
      title: 'QA',
      company: 'Acme',
      location: 'Utrecht',
      url: null,
      source: 'manual',
      description: 'd',
      posted_at: null,
      status: 'new',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      hybrid_quote: null,
      language: 'unknown',
      recommended_document_ids: [],
    });
    expect(manualJobToRow('u1', 'id1', { ...job, postedAt: '2026-01-01', hybridQuote: 'q' }, 'manual')).toMatchObject({
      posted_at: '2026-01-01',
      hybrid_quote: 'q',
    });
  });

  it('maps an application insert and a patch (only present keys)', () => {
    expect(applicationToInsertRow('u1', { jobId: 'j1', cvDocumentId: 'd1', letterDocumentId: null, cvLabel: 'CV', notes: 'n' })).toEqual({
      user_id: 'u1',
      job_id: 'j1',
      cv_document_id: 'd1',
      letter_document_id: null,
      cv_label: 'CV',
      notes: 'n',
      stage: 'applied',
    });
    expect(
      applicationPatchToRow({
        appliedAt: '2026-01-01',
        cvDocumentId: null,
        letterDocumentId: 'd2',
        cvLabel: 'L',
        notes: 'N',
        stage: 'offer',
      }),
    ).toEqual({
      applied_at: '2026-01-01',
      cv_document_id: null,
      letter_document_id: 'd2',
      cv_label: 'L',
      notes: 'N',
      stage: 'offer',
    });
    expect(applicationPatchToRow({ notes: 'only', stage: undefined })).toEqual({ notes: 'only' });
    expect(applicationPatchToRow({})).toEqual({});
  });

  it('maps a document insert', () => {
    expect(documentToInsertRow('u1', 'd1', { name: 'cv.pdf', size: 10, type: 'application/pdf' }, { kind: 'cv', jobId: 'j1' }, 'u1/d1/cv.pdf')).toEqual({
      id: 'd1',
      user_id: 'u1',
      job_id: 'j1',
      kind: 'cv',
      filename: 'cv.pdf',
      mime: 'application/pdf',
      size_bytes: 10,
      storage_path: 'u1/d1/cv.pdf',
    });
    expect(documentToInsertRow('u1', 'd1', { name: 'a.pdf', size: 1, type: 'application/pdf' }, { kind: 'template' }, 'p').job_id).toBeNull();
  });
});
