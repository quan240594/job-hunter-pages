// Shared contract types for Job Hunter Pages. Owned by the scaffold.
// docs/CONTRACT.md is the source of truth; do not change this file without recording it in docs/CONTRACT-CHANGES.md.
// Only erasable TypeScript syntax (no enums/namespaces). Interfaces and aliases only: no runtime code.
// TS types are camelCase; Postgres columns are the snake_case equivalents.

export type ISODateTime = string;

/** From the JWT claim app_metadata.role; defaults to 'user' when the claim is absent. */
export type Role = 'admin' | 'user';

export type JobStatus = 'new' | 'applied' | 'skipped';
/** A = qualified (hybrid/remote quoted, no Dutch needed); B = Dutch needed; C = hybrid unclear; D = agency/consultancy */
export type Category = 'A' | 'B' | 'C' | 'D';
export type HybridStatus = 'quoted' | 'unclear' | 'office-first';
export type LanguageStatus = 'english' | 'dutch' | 'unknown';
export type Seniority = 'mid' | 'senior' | 'staff' | 'unknown';
/** 0 = not scored (e.g. manual entries), 1-5 = fit with the profile. */
export type Fit = 0 | 1 | 2 | 3 | 4 | 5;
export type ApplicationStage = 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
export type DocumentKind = 'cv' | 'letter' | 'template';
export type DocumentMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'template_limit'
  | 'conflict'
  | 'network'
  | 'unknown';

/** Every DataApi method rejects with this shape (never a bare Error). */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

/** The signed-in user as the UI needs it. */
export interface Session {
  userId: string;
  email: string;
  role: Role;
  /** user_metadata.must_change_password: set when an admin created the account with a temporary password. */
  mustChangePassword: boolean;
}

// ---------------------------------------------------------------- profile

export interface CvContact {
  name: string;
  email: string;
  phone: string;
  location: string;
}
export interface CvExperience {
  role: string;
  company: string;
  location: string;
  /** ISO date (YYYY-MM or YYYY-MM-DD). */
  startDate: string;
  /** null = current position. */
  endDate: string | null;
  bullets: string[];
}
export interface CvEducation {
  degree: string;
  school: string;
  location: string;
  startDate: string;
  endDate: string | null;
}
export interface CvSkills {
  /** Lower-case keywords the person has. */
  has: string[];
  /** Lower-case keywords the person lacks (used to warn about gaps in postings). */
  lacks: string[];
}
export interface CvLanguage {
  name: string;
  /** Free text, e.g. 'native', 'C1'. */
  level: string;
}
export interface CvLink {
  label: string;
  url: string;
}
export interface CvProfile {
  contact: CvContact;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkills;
  languages: CvLanguage[];
  links: CvLink[];
}

/**
 * Stored in phase 1, consumed by per-user automated scraping in phase 2 (NOT used by anything in phase 1).
 */
export interface SearchSettings {
  keywords: string[];
  /** Defaults to ['Amsterdam', 'Rotterdam', 'Den Haag']. */
  cities: string[];
  remote: 'hybrid-or-remote' | 'any';
  englishOnly: boolean;
  minSeniority: 'any' | Exclude<Seniority, 'unknown'>;
}

export interface Profile {
  userId: string;
  displayName: string;
  headline: string;
  summary: string;
  cv: CvProfile;
  searchSettings: SearchSettings;
  updatedAt: ISODateTime;
}
/** What the client sends to profile.save(): userId and updatedAt are set by the backend. */
export type ProfileInput = Omit<Profile, 'userId' | 'updatedAt'>;

// ---------------------------------------------------------------- jobs

export interface Job {
  /** Stable string, unique per (user, job): first 16 hex chars of sha1(norm(company)|norm(title)|norm(location)). */
  id: string;
  userId: string;
  title: string;
  company: string;
  /** City ('Unknown' when not known). */
  location: string;
  url: string | null;
  /** 'manual' for user-entered jobs; otherwise the scraper source, e.g. 'greenhouse:adyen'. */
  source: string;
  description: string;
  postedAt?: ISODateTime;
  firstSeenAt: ISODateTime;
  status: JobStatus;
  fit: Fit;
  category: Category;
  hybrid: HybridStatus;
  hybridQuote?: string;
  language: LanguageStatus;
  recommendedDocumentIds: string[];
}

export interface JobListQuery {
  status?: JobStatus;
  /** Filter on firstSeenAt, inclusive. */
  since?: ISODateTime;
  /** Filter on firstSeenAt, inclusive. */
  until?: ISODateTime;
  /** Case-insensitive match on title, company and location. */
  search?: string;
}

export interface ManualJobInput {
  title: string;
  company: string;
  location: string;
  url?: string;
  description: string;
  postedAt?: ISODateTime;
  /** Defaults to 0. */
  fit?: Fit;
  /** Defaults to 'C'. */
  category?: Category;
  /** Defaults to 'unclear'. */
  hybrid?: HybridStatus;
  hybridQuote?: string;
  /** Defaults to 'unknown'. */
  language?: LanguageStatus;
}

// ---------------------------------------------------------------- applications

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  appliedAt: ISODateTime;
  /** null when no document was used, or the document has expired and was removed. */
  cvDocumentId: string | null;
  letterDocumentId: string | null;
  /** Text label kept even if the document later expires (UI shows 'document expired'). */
  cvLabel: string;
  notes: string;
  stage: ApplicationStage;
}

export interface ApplicationListQuery {
  /** Filter on appliedAt, inclusive. */
  since?: ISODateTime;
  /** Filter on appliedAt, inclusive. */
  until?: ISODateTime;
}

export interface ApplyInput {
  jobId: string;
  cvDocumentId: string | null;
  letterDocumentId: string | null;
  cvLabel: string;
  notes: string;
}

export type ApplicationPatch = Partial<
  Pick<Application, 'appliedAt' | 'cvDocumentId' | 'letterDocumentId' | 'cvLabel' | 'notes' | 'stage'>
>;

// ---------------------------------------------------------------- documents

export interface DocumentMeta {
  id: string;
  userId: string;
  jobId: string | null;
  kind: DocumentKind;
  filename: string;
  mime: DocumentMime;
  sizeBytes: number;
  /** Storage object path in the private 'documents' bucket: {userId}/{documentId}/{filename}. */
  storagePath: string;
  createdAt: ISODateTime;
  /** createdAt + 6 months for cv/letter; null for template (never expires). */
  expiresAt: ISODateTime | null;
}

export interface DocumentListQuery {
  kind?: DocumentKind;
}

export interface UploadOptions {
  kind: DocumentKind;
  jobId?: string;
}

/** Built-in read-only reference template (static assets, fictional person). Does not count toward the 3-template cap. */
export interface StandardTemplate {
  id: string;
  title: string;
  description: string;
  pdfUrl: string;
  docxUrl: string;
}

// ---------------------------------------------------------------- admin

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  createdAt: ISODateTime;
  lastSignInAt: ISODateTime | null;
  banned: boolean;
}

export interface CreateUserInput {
  email: string;
  /** Omitted = the user gets an invite email. Present = created email-confirmed with must_change_password. */
  tempPassword?: string;
  role: Role;
}

/** Request body of POST /functions/v1/admin-users. */
export type AdminAction =
  | { action: 'listUsers' }
  | ({ action: 'createUser' } & CreateUserInput)
  | { action: 'setRole'; id: string; role: Role }
  | { action: 'setBanned'; id: string; banned: boolean }
  | { action: 'deleteUser'; id: string }
  /** Any authenticated user; deletes the caller (auth user, rows, storage objects). Backs auth.deleteMyAccount(). */
  | { action: 'deleteSelf' };

/** Response body of the admin-users Edge Function. */
export type AdminResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
