// Fictional demo data for the mock API (the GitHub Pages demo and e2e). Everything is relative to the injected clock,
// so time filters stay meaningful. No real people, companies or contact details.
import { DOCX_MIME, expiresAtFor, PDF_MIME } from './documentRules';
import type { AdminUser, Application, CvProfile, DocumentMeta, Job, Profile } from './types';

export const ALEX_ID = 'user-alex';
export const ADMIN_ID = 'user-admin';
export const ALEX_EMAIL = 'alex@example.com';
export const ADMIN_EMAIL = 'admin@example.com';

const DAY_MS = 86_400_000;

export interface MockUser extends AdminUser {
  mustChangePassword: boolean;
}

export interface MockSeed {
  users: MockUser[];
  profile: Profile;
  jobs: Job[];
  applications: Application[];
  documents: DocumentMeta[];
}

const ids = {
  cvDoc: '8f1c2a10-0000-4000-8000-000000000001',
  letterDoc: '8f1c2a10-0000-4000-8000-000000000002',
  templateDoc: '8f1c2a10-0000-4000-8000-000000000003',
  expiredCvDoc: '8f1c2a10-0000-4000-8000-000000000004',
};

const CV: CvProfile = {
  contact: { name: 'Alex Example', email: ALEX_EMAIL, phone: '+31 6 00000000', location: 'Amsterdam' },
  experience: [
    {
      role: 'Senior Software Engineer',
      company: 'Tulip Software',
      location: 'Amsterdam',
      startDate: '2021-03',
      endDate: null,
      bullets: ['Led a team of four building a payments API.', 'Cut p95 latency by 40% with caching and query tuning.'],
    },
    {
      role: 'Software Engineer',
      company: 'Windmill Labs',
      location: 'Utrecht',
      startDate: '2017-09',
      endDate: '2021-02',
      bullets: ['Built internal tooling in TypeScript and Java.'],
    },
  ],
  education: [
    { degree: 'MSc Computer Science', school: 'Example University', location: 'Delft', startDate: '2015-09', endDate: '2017-07' },
  ],
  skills: { has: ['java', 'typescript', 'react', 'postgresql', 'docker'], lacks: ['kubernetes', 'golang'] },
  languages: [
    { name: 'English', level: 'native' },
    { name: 'Dutch', level: 'B2' },
  ],
  links: [{ label: 'Portfolio', url: 'https://example.com/alex' }],
};

interface JobSeed {
  id: string;
  title: string;
  company: string;
  location: string;
  daysAgo: number;
  status: Job['status'];
  fit: Job['fit'];
  category: Job['category'];
  hybrid: Job['hybrid'];
  language: Job['language'];
  source: string;
  quote?: string;
  postedDaysAgo?: number;
}

const JOB_SEEDS: readonly JobSeed[] = [
  { id: '7668781b05b7b63f', title: 'Senior Backend Engineer', company: 'Polder Payments', location: 'Amsterdam', daysAgo: 2, status: 'new', fit: 5, category: 'A', hybrid: 'quoted', language: 'english', source: 'greenhouse:polder-payments', quote: 'Hybrid: two days per week in the office.', postedDaysAgo: 3 },
  { id: 'ac701b87eeaeacc6', title: 'Full-stack Developer', company: 'Canal Cloud', location: 'Amsterdam', daysAgo: 5, status: 'new', fit: 4, category: 'A', hybrid: 'quoted', language: 'english', source: 'lever:canal-cloud', quote: 'Remote-first within the Netherlands.' },
  { id: '5f2a9133dfab860e', title: 'Platform Engineer', company: 'Harbour Health', location: 'Rotterdam', daysAgo: 9, status: 'new', fit: 3, category: 'C', hybrid: 'unclear', language: 'english', source: 'greenhouse:harbour-health' },
  { id: 'f336e9aa5cc2f9ec', title: 'Java Developer', company: 'Dijk Data', location: 'Den Haag', daysAgo: 14, status: 'applied', fit: 4, category: 'B', hybrid: 'quoted', language: 'dutch', source: 'smartrecruiters:dijk-data', quote: 'Hybride werken, 3 dagen thuis.' },
  { id: '0970307679e479d7', title: 'Staff Engineer', company: 'Nimbus Networks', location: 'Amsterdam', daysAgo: 21, status: 'applied', fit: 5, category: 'A', hybrid: 'quoted', language: 'english', source: 'greenhouse:nimbus-networks', quote: 'Hybrid, flexible office days.' },
  { id: '7b34d8a9271d0a0f', title: 'Software Consultant', company: 'Brick Robotics Consulting', location: 'Rotterdam', daysAgo: 30, status: 'skipped', fit: 2, category: 'D', hybrid: 'office-first', language: 'english', source: 'lever:brick-robotics' },
  { id: 'dc774bab8a6cd11c', title: 'Frontend Engineer', company: 'Orange Orbit', location: 'Amsterdam', daysAgo: 45, status: 'applied', fit: 3, category: 'A', hybrid: 'quoted', language: 'english', source: 'greenhouse:orange-orbit', quote: 'Remote or hybrid.' },
  { id: '8914580ab8305799', title: 'Data Engineer', company: 'Lantern Logistics', location: 'Rotterdam', daysAgo: 60, status: 'new', fit: 2, category: 'C', hybrid: 'unclear', language: 'unknown', source: 'smartrecruiters:lantern-logistics' },
  { id: '1c6828f4e2afd121', title: 'Engineering Manager', company: 'Kade Commerce', location: 'Den Haag', daysAgo: 80, status: 'skipped', fit: 1, category: 'B', hybrid: 'office-first', language: 'dutch', source: 'lever:kade-commerce' },
  { id: '14f533261c013190', title: 'Backend Engineer (Kotlin)', company: 'Windmill Labs', location: 'Utrecht', daysAgo: 100, status: 'applied', fit: 4, category: 'A', hybrid: 'quoted', language: 'english', source: 'greenhouse:windmill-labs', quote: 'Hybrid with a monthly team day.' },
  { id: '3346b5e6f421ab83', title: 'Site Reliability Engineer', company: 'Acme Analytics', location: 'Amsterdam', daysAgo: 130, status: 'new', fit: 3, category: 'C', hybrid: 'unclear', language: 'english', source: 'manual' },
  { id: '02c9a7be31f440f3', title: 'Solutions Architect', company: 'Tulip Software', location: 'Unknown', daysAgo: 160, status: 'new', fit: 0, category: 'C', hybrid: 'unclear', language: 'unknown', source: 'manual' },
];

const at = (now: Date, daysAgo: number): string => new Date(now.getTime() - daysAgo * DAY_MS).toISOString();

function seedJob(now: Date, seed: JobSeed): Job {
  return {
    id: seed.id,
    userId: ALEX_ID,
    title: seed.title,
    company: seed.company,
    location: seed.location,
    url: seed.source === 'manual' ? null : `https://jobs.example.com/${seed.id}`,
    source: seed.source,
    description: `${seed.title} at ${seed.company}. Fictional demo posting for Job Hunter Pages.`,
    ...(seed.postedDaysAgo === undefined ? {} : { postedAt: at(now, seed.postedDaysAgo) }),
    firstSeenAt: at(now, seed.daysAgo),
    status: seed.status,
    fit: seed.fit,
    category: seed.category,
    hybrid: seed.hybrid,
    ...(seed.quote === undefined ? {} : { hybridQuote: seed.quote }),
    language: seed.language,
    recommendedDocumentIds: seed.fit >= 4 ? [ids.cvDoc] : [],
  };
}

function seedDocument(
  now: Date,
  doc: Pick<DocumentMeta, 'id' | 'kind' | 'filename' | 'mime' | 'sizeBytes'> & { daysAgo: number },
): DocumentMeta {
  const createdAt = at(now, doc.daysAgo);
  return {
    id: doc.id,
    userId: ALEX_ID,
    jobId: null,
    kind: doc.kind,
    filename: doc.filename,
    mime: doc.mime,
    sizeBytes: doc.sizeBytes,
    storagePath: `${ALEX_ID}/${doc.id}/${doc.filename}`,
    createdAt,
    expiresAt: expiresAtFor(doc.kind, createdAt),
  };
}

function seedApplication(now: Date, app: Pick<Application, 'id' | 'jobId' | 'stage' | 'cvLabel' | 'notes'> & Partial<Application> & { daysAgo: number }): Application {
  return {
    userId: ALEX_ID,
    appliedAt: at(now, app.daysAgo),
    cvDocumentId: null,
    letterDocumentId: null,
    ...app,
  };
}

export function createSeed(now: Date): MockSeed {
  return {
    users: [
      { id: ADMIN_ID, email: ADMIN_EMAIL, role: 'admin', createdAt: at(now, 200), lastSignInAt: at(now, 1), banned: false, mustChangePassword: false },
      { id: ALEX_ID, email: ALEX_EMAIL, role: 'user', createdAt: at(now, 180), lastSignInAt: at(now, 2), banned: false, mustChangePassword: false },
    ],
    profile: {
      userId: ALEX_ID,
      displayName: 'Alex Example',
      headline: 'Senior software engineer, Java and TypeScript',
      summary: 'Backend-leaning engineer with eight years of experience building payment and data platforms.',
      cv: CV,
      searchSettings: {
        keywords: ['java', 'typescript', 'platform'],
        cities: ['Amsterdam', 'Rotterdam', 'Den Haag'],
        remote: 'hybrid-or-remote',
        englishOnly: false,
        minSeniority: 'senior',
      },
      updatedAt: at(now, 10),
    },
    jobs: JOB_SEEDS.map((seed) => seedJob(now, seed)),
    applications: [
      seedApplication(now, { id: 'app-1', jobId: 'f336e9aa5cc2f9ec', daysAgo: 12, stage: 'interview', cvLabel: 'Alex CV (Java)', notes: 'First interview done, waiting for a technical round.', cvDocumentId: ids.cvDoc, letterDocumentId: ids.letterDoc }),
      seedApplication(now, { id: 'app-2', jobId: '0970307679e479d7', daysAgo: 19, stage: 'applied', cvLabel: 'Alex CV (Java)', notes: '', cvDocumentId: ids.cvDoc }),
      seedApplication(now, { id: 'app-3', jobId: 'dc774bab8a6cd11c', daysAgo: 40, stage: 'rejected', cvLabel: 'Alex CV 2026 (older)', notes: 'Rejected after the screening call.' }),
      seedApplication(now, { id: 'app-4', jobId: '14f533261c013190', daysAgo: 95, stage: 'withdrawn', cvLabel: 'Standard CV template', notes: 'Accepted another offer.' }),
    ],
    documents: [
      seedDocument(now, { id: ids.cvDoc, kind: 'cv', filename: 'alex-cv-java.pdf', mime: PDF_MIME, sizeBytes: 182_400, daysAgo: 20 }),
      seedDocument(now, { id: ids.letterDoc, kind: 'letter', filename: 'alex-letter-dijk-data.docx', mime: DOCX_MIME, sizeBytes: 38_912, daysAgo: 45 }),
      seedDocument(now, { id: ids.templateDoc, kind: 'template', filename: 'alex-base-cv.pdf', mime: PDF_MIME, sizeBytes: 176_128, daysAgo: 150 }),
      seedDocument(now, { id: ids.expiredCvDoc, kind: 'cv', filename: 'alex-cv-2025.pdf', mime: PDF_MIME, sizeBytes: 171_008, daysAgo: 200 }),
    ],
  };
}
