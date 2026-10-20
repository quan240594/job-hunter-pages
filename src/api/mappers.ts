// Pure snake_case <-> camelCase mappers between Postgres rows (PostgREST JSON) and the contract types.
// Rows are validated at the boundary: a malformed response rejects with 'unknown' instead of leaking into the UI.
import { isAllowedMime } from './documentRules';
import { APPLICATION_STAGES, CATEGORIES, DOCUMENT_KINDS, FITS, HYBRID_STATUSES, JOB_STATUSES, LANGUAGES, ROLES } from './enums';
import { apiError } from './errors';
import type { PreparedManualJob } from './manualJob';
import type {
  AdminUser,
  Application,
  ApplicationPatch,
  ApplyInput,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvLink,
  CvProfile,
  DocumentKind,
  DocumentMeta,
  Job,
  Profile,
  ProfileInput,
  SearchSettings,
  UploadOptions,
} from './types';

type Row = Record<string, unknown>;

export const DEFAULT_CITIES: readonly string[] = ['Amsterdam', 'Rotterdam', 'Den Haag'];

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(field: string): never {
  throw apiError('unknown', `Unexpected value for '${field}' in the response.`);
}

function asRow(value: unknown, what: string): Row {
  return isRecord(value) ? value : malformed(what);
}

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : malformed(key);
}

function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : malformed(key);
}

function num(row: Row, key: string): number {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : malformed(key);
}

function bool(row: Row, key: string): boolean {
  const value = row[key];
  return typeof value === 'boolean' ? value : malformed(key);
}

function oneOf<T extends string | number>(row: Row, key: string, allowed: readonly T[]): T {
  const value = row[key];
  const match = allowed.find((candidate) => candidate === value);
  return match === undefined ? malformed(key) : match;
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return malformed(key);
  return value;
}

/** Absent (not null) when the column is null, as the contract requires for optional fields. */
function optionalText<K extends string>(key: K, value: string | null): { [P in K]?: string } {
  return value === null ? {} : ({ [key]: value } as { [P in K]: string });
}

// ------------------------------------------------------------------ rows -> domain

export function jobFromRow(value: unknown): Job {
  const row = asRow(value, 'job');
  return {
    id: str(row, 'id'),
    userId: str(row, 'user_id'),
    title: str(row, 'title'),
    company: str(row, 'company'),
    location: str(row, 'location'),
    url: strOrNull(row, 'url'),
    source: str(row, 'source'),
    description: str(row, 'description'),
    ...optionalText('postedAt', strOrNull(row, 'posted_at')),
    firstSeenAt: str(row, 'first_seen_at'),
    status: oneOf(row, 'status', JOB_STATUSES),
    fit: oneOf(row, 'fit', FITS),
    category: oneOf(row, 'category', CATEGORIES),
    hybrid: oneOf(row, 'hybrid', HYBRID_STATUSES),
    ...optionalText('hybridQuote', strOrNull(row, 'hybrid_quote')),
    language: oneOf(row, 'language', LANGUAGES),
    recommendedDocumentIds: strArray(row, 'recommended_document_ids'),
  };
}

export function applicationFromRow(value: unknown): Application {
  const row = asRow(value, 'application');
  return {
    id: str(row, 'id'),
    userId: str(row, 'user_id'),
    jobId: str(row, 'job_id'),
    appliedAt: str(row, 'applied_at'),
    cvDocumentId: strOrNull(row, 'cv_document_id'),
    letterDocumentId: strOrNull(row, 'letter_document_id'),
    cvLabel: str(row, 'cv_label'),
    notes: str(row, 'notes'),
    stage: oneOf(row, 'stage', APPLICATION_STAGES),
  };
}

export function documentFromRow(value: unknown): DocumentMeta {
  const row = asRow(value, 'document');
  const mime = str(row, 'mime');
  if (!isAllowedMime(mime)) return malformed('mime');
  return {
    id: str(row, 'id'),
    userId: str(row, 'user_id'),
    jobId: strOrNull(row, 'job_id'),
    kind: oneOf(row, 'kind', DOCUMENT_KINDS),
    filename: str(row, 'filename'),
    mime,
    sizeBytes: num(row, 'size_bytes'),
    storagePath: str(row, 'storage_path'),
    createdAt: str(row, 'created_at'),
    expiresAt: strOrNull(row, 'expires_at'),
  };
}

/** One string column of a partial select, e.g. `select('storage_path')`. */
export function textColumn(value: unknown, key: string): string {
  return str(asRow(value, 'row'), key);
}

export function adminUserFromJson(value: unknown): AdminUser {
  const row = asRow(value, 'user');
  return {
    id: str(row, 'id'),
    email: str(row, 'email'),
    role: oneOf(row, 'role', ROLES),
    createdAt: str(row, 'createdAt'),
    lastSignInAt: strOrNull(row, 'lastSignInAt'),
    banned: bool(row, 'banned'),
  };
}

// The jsonb columns are written by this app only, so they are read leniently: anything missing falls back to empty.
function text(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function texts(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function experienceFromJson(row: Row): CvExperience {
  return {
    role: text(row, 'role'),
    company: text(row, 'company'),
    location: text(row, 'location'),
    startDate: text(row, 'startDate'),
    endDate: textOrNull(row, 'endDate'),
    bullets: texts(row, 'bullets'),
  };
}

function educationFromJson(row: Row): CvEducation {
  return {
    degree: text(row, 'degree'),
    school: text(row, 'school'),
    location: text(row, 'location'),
    startDate: text(row, 'startDate'),
    endDate: textOrNull(row, 'endDate'),
  };
}

function languageFromJson(row: Row): CvLanguage {
  return { name: text(row, 'name'), level: text(row, 'level') };
}

function linkFromJson(row: Row): CvLink {
  return { label: text(row, 'label'), url: text(row, 'url') };
}

export function cvFromJson(value: unknown): CvProfile {
  const cv = isRecord(value) ? value : {};
  const contact = isRecord(cv.contact) ? cv.contact : {};
  const skills = isRecord(cv.skills) ? cv.skills : {};
  return {
    contact: {
      name: text(contact, 'name'),
      email: text(contact, 'email'),
      phone: text(contact, 'phone'),
      location: text(contact, 'location'),
    },
    experience: records(cv.experience).map(experienceFromJson),
    education: records(cv.education).map(educationFromJson),
    skills: { has: texts(skills, 'has'), lacks: texts(skills, 'lacks') },
    languages: records(cv.languages).map(languageFromJson),
    links: records(cv.links).map(linkFromJson),
  };
}

export function searchSettingsFromJson(value: unknown): SearchSettings {
  const settings = isRecord(value) ? value : {};
  const remote = settings.remote === 'any' ? 'any' : 'hybrid-or-remote';
  const seniority = ['mid', 'senior', 'staff'].find((candidate) => candidate === settings.minSeniority);
  return {
    keywords: texts(settings, 'keywords'),
    cities: Array.isArray(settings.cities) ? texts(settings, 'cities') : [...DEFAULT_CITIES],
    remote,
    englishOnly: settings.englishOnly === true,
    minSeniority: (seniority ?? 'any') as SearchSettings['minSeniority'],
  };
}

export function profileFromRow(value: unknown): Profile {
  const row = asRow(value, 'profile');
  return {
    userId: str(row, 'user_id'),
    displayName: str(row, 'display_name'),
    headline: str(row, 'headline'),
    summary: str(row, 'summary'),
    cv: cvFromJson(row.cv),
    searchSettings: searchSettingsFromJson(row.search_settings),
    updatedAt: str(row, 'updated_at'),
  };
}

// ------------------------------------------------------------------ domain -> rows

export function profileToRow(userId: string, input: ProfileInput): Row {
  return {
    user_id: userId,
    display_name: input.displayName,
    headline: input.headline,
    summary: input.summary,
    cv: input.cv,
    search_settings: input.searchSettings,
  };
}

export function manualJobToRow(userId: string, id: string, job: PreparedManualJob, source: string): Row {
  return {
    user_id: userId,
    id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    source,
    description: job.description,
    posted_at: job.postedAt ?? null,
    status: 'new',
    fit: job.fit,
    category: job.category,
    hybrid: job.hybrid,
    hybrid_quote: job.hybridQuote ?? null,
    language: job.language,
    recommended_document_ids: [],
  };
}

export function applicationToInsertRow(userId: string, input: ApplyInput): Row {
  return {
    user_id: userId,
    job_id: input.jobId,
    cv_document_id: input.cvDocumentId,
    letter_document_id: input.letterDocumentId,
    cv_label: input.cvLabel,
    notes: input.notes,
    stage: 'applied',
  };
}

const PATCH_COLUMNS: readonly (readonly [keyof ApplicationPatch, string])[] = [
  ['appliedAt', 'applied_at'],
  ['cvDocumentId', 'cv_document_id'],
  ['letterDocumentId', 'letter_document_id'],
  ['cvLabel', 'cv_label'],
  ['notes', 'notes'],
  ['stage', 'stage'],
];

/** Only the keys present in the patch; `undefined` means "leave unchanged". */
export function applicationPatchToRow(patch: ApplicationPatch): Row {
  return Object.fromEntries(
    PATCH_COLUMNS.filter(([key]) => patch[key] !== undefined).map(([key, column]) => [column, patch[key]]),
  );
}

export function documentToInsertRow(
  userId: string,
  documentId: string,
  file: Pick<File, 'name' | 'size' | 'type'>,
  options: UploadOptions,
  storagePath: string,
): Row {
  const kind: DocumentKind = options.kind;
  return {
    id: documentId,
    user_id: userId,
    job_id: options.jobId ?? null,
    kind,
    filename: file.name,
    mime: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
  };
}
