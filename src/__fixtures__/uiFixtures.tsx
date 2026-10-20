import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Application, DataApi, DocumentMeta, Job, Profile, Session, StandardTemplate } from '../api';
import { AuthContext } from '../auth/context';
import type { AuthContextValue } from '../auth/context';

export const NOW_ISO = '2026-10-20T10:00:00.000Z';
export const NOW = new Date(NOW_ISO);
export const ALEX_SESSION: Session = { userId: 'user-alex', email: 'alex@example.com', role: 'user', mustChangePassword: false };

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    userId: 'user-alex',
    title: 'Frontend Engineer',
    company: 'Example BV',
    location: 'Amsterdam',
    url: 'https://jobs.example.com/frontend',
    source: 'greenhouse:example',
    description: 'Build accessible interfaces with React.',
    firstSeenAt: '2026-10-18T08:00:00.000Z',
    status: 'new',
    fit: 4,
    category: 'A',
    hybrid: 'quoted',
    hybridQuote: 'Two days per week in the office',
    language: 'english',
    recommendedDocumentIds: [],
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: 'doc-cv',
    userId: 'user-alex',
    jobId: null,
    kind: 'cv',
    filename: 'alex-example-cv.pdf',
    mime: 'application/pdf',
    sizeBytes: 120_000,
    storagePath: 'user-alex/doc-cv/alex-example-cv.pdf',
    createdAt: '2026-09-01T10:00:00.000Z',
    expiresAt: '2027-03-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    userId: 'user-alex',
    jobId: 'job-1',
    appliedAt: '2026-10-10T09:00:00.000Z',
    cvDocumentId: 'doc-cv',
    letterDocumentId: null,
    cvLabel: 'alex-example-cv.pdf',
    notes: '',
    stage: 'applied',
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: 'user-alex',
    displayName: 'Alex Example',
    headline: 'Software engineer',
    summary: 'Builds reliable web apps.',
    cv: {
      contact: { name: 'Alex Example', email: 'alex@example.com', phone: '+31 6 0000 0000', location: 'Amsterdam' },
      experience: [
        {
          role: 'Engineer',
          company: 'Example BV',
          location: 'Amsterdam',
          startDate: '2021-03',
          endDate: null,
          bullets: ['Built a design system', 'Cut load time by half'],
        },
      ],
      education: [{ degree: 'BSc Computer Science', school: 'Example University', location: 'Utrecht', startDate: '2014-09', endDate: '2018-06' }],
      skills: { has: ['react', 'typescript'], lacks: ['kubernetes'] },
      languages: [{ name: 'English', level: 'C1' }],
      links: [{ label: 'Portfolio', url: 'https://alex.example.com' }],
    },
    searchSettings: {
      keywords: ['frontend'],
      cities: ['Amsterdam', 'Rotterdam'],
      remote: 'hybrid-or-remote',
      englishOnly: true,
      minSeniority: 'mid',
    },
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    id: 'standard-cv',
    title: 'Standard CV template',
    description: 'One-page reference layout.',
    pdfUrl: 'templates/standard-cv-template.pdf',
    docxUrl: 'templates/standard-cv-template.docx',
  },
];

export type ApiOverrides = { [K in keyof DataApi]?: Partial<DataApi[K]> };

/** An Error that also carries the ApiError code, so it is both a real Error and an ApiError. */
function apiError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const unstubbed = () => Promise.reject(apiError('unknown', 'not stubbed'));

/** A DataApi whose every method rejects until a test provides it. Methods are vi.fn so calls can be asserted. */
export function createStubApi(overrides: ApiOverrides = {}): DataApi {
  return {
    auth: {
      getSession: vi.fn(unstubbed),
      onAuthChange: vi.fn(() => () => undefined),
      signIn: vi.fn(unstubbed),
      signOut: vi.fn(unstubbed),
      changePassword: vi.fn(unstubbed),
      deleteMyAccount: vi.fn(unstubbed),
      exportMyData: vi.fn(unstubbed),
      ...overrides.auth,
    },
    jobs: { list: vi.fn(unstubbed), get: vi.fn(unstubbed), setStatus: vi.fn(unstubbed), addManual: vi.fn(unstubbed), ...overrides.jobs },
    applications: {
      list: vi.fn(unstubbed),
      apply: vi.fn(unstubbed),
      update: vi.fn(unstubbed),
      remove: vi.fn(unstubbed),
      ...overrides.applications,
    },
    profile: { get: vi.fn(unstubbed), save: vi.fn(unstubbed), ...overrides.profile },
    documents: {
      list: vi.fn(unstubbed),
      upload: vi.fn(unstubbed),
      signedUrl: vi.fn(unstubbed),
      remove: vi.fn(unstubbed),
      standardTemplates: vi.fn(unstubbed),
      ...overrides.documents,
    },
    admin: {
      listUsers: vi.fn(unstubbed),
      createUser: vi.fn(unstubbed),
      setRole: vi.fn(unstubbed),
      setBanned: vi.fn(unstubbed),
      deleteUser: vi.fn(unstubbed),
      ...overrides.admin,
    },
  };
}

export function authValue(api: DataApi, session: Session | null = ALEX_SESSION): AuthContextValue {
  return {
    state: session === null ? { status: 'anonymous' } : { status: 'authenticated', session },
    api,
    signIn: vi.fn(() => Promise.resolve(ALEX_SESSION)),
    signOut: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(() => Promise.resolve()),
  };
}

/** Renders inside a router and an authenticated auth context (no AuthProvider loading round trip). */
export function renderWithApi(ui: ReactElement, api: DataApi, route = '/'): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={authValue(api)}>{ui}</AuthContext.Provider>
    </MemoryRouter>,
  );
}

export const rejection = (code: string, message: string) => Promise.reject(apiError(code, message));
