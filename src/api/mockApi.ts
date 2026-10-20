// In-memory DataApi for `VITE_DATA_MODE=mock` (the GitHub Pages demo and the e2e tests). No backend, no persistence:
// a page reload restores the seed. Behaviour mirrors docs/CONTRACT.md, including the error codes.
//
// Demo logins: alex@example.com (role user) and admin@example.com (role admin), each with any non-empty password.
// Users created through admin.createUser can sign in with any non-empty password too.
import type { AdminApi, ApplicationsApi, AuthApi, DataApi, DocumentsApi, JobsApi, ProfileApi } from './dataApi';
import { expiresAtFor, MAX_TEMPLATES, storagePathFor, validateUpload } from './documentRules';
import { APPLICATION_STAGES } from './enums';
import { apiError } from './errors';
import { jobId } from './jobId';
import { MANUAL_SOURCE, prepareManualJob } from './manualJob';
import { createSeed, type MockUser } from './mockSeed';
import { standardTemplates } from './standardTemplates';
import type {
  AdminUser,
  Application,
  ApplicationListQuery,
  ApplicationPatch,
  ApplyInput,
  CreateUserInput,
  DocumentListQuery,
  DocumentMeta,
  Job,
  JobListQuery,
  JobStatus,
  ManualJobInput,
  Profile,
  ProfileInput,
  Role,
  Session,
  UploadOptions,
} from './types';

export interface MockApiOptions {
  /** Defaults to the real clock. The seed data is relative to it. */
  now?: () => Date;
  /** Defaults to crypto.randomUUID. */
  newId?: () => string;
  /** Defaults to URL.createObjectURL. */
  createObjectUrl?: (blob: Blob) => string;
}

interface StoredDocument {
  meta: DocumentMeta;
  blob: Blob;
}

interface MockState {
  currentUserId: string | null;
  users: MockUser[];
  profiles: Profile[];
  jobs: Job[];
  applications: Application[];
  documents: StoredDocument[];
}

interface Ctx {
  state: MockState;
  clock: () => string;
  newId: () => string;
  objectUrl: (blob: Blob) => string;
  listeners: Set<(session: Session | null) => void>;
}

const copy = <T>(value: T): T => structuredClone(value);

/** Turns a synchronous, possibly throwing implementation into a promise-returning method. */
function asyncify<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => Promise<R> {
  return (...args) => {
    try {
      return Promise.resolve(fn(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

function toSession(user: MockUser): Session {
  return { userId: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

function toAdminUser(user: MockUser): AdminUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    banned: user.banned,
  };
}

function currentUser(ctx: Ctx): MockUser | null {
  return ctx.state.users.find((user) => user.id === ctx.state.currentUserId) ?? null;
}

function requireUser(ctx: Ctx): MockUser {
  const user = currentUser(ctx);
  if (user === null) throw apiError('unauthenticated', 'You are not signed in.');
  return user;
}

function requireAdmin(ctx: Ctx): MockUser {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw apiError('forbidden', 'Admin access is required.');
  return user;
}

function currentSession(ctx: Ctx): Session | null {
  const user = currentUser(ctx);
  return user === null ? null : toSession(user);
}

function notify(ctx: Ctx): void {
  const session = currentSession(ctx);
  for (const listener of ctx.listeners) listener(session);
}

function parseBound(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw apiError('validation', `'${value}' is not a valid date.`);
  return time;
}

function inRange(iso: string, since: number | undefined, until: number | undefined): boolean {
  const time = Date.parse(iso);
  return (since === undefined || time >= since) && (until === undefined || time <= until);
}

function newestFirst<T>(items: T[], dateOf: (item: T) => string): T[] {
  return items.toSorted((a, b) => Date.parse(dateOf(b)) - Date.parse(dateOf(a)));
}

function removeUserData(state: MockState, userId: string): void {
  state.users = state.users.filter((user) => user.id !== userId);
  state.profiles = state.profiles.filter((profile) => profile.userId !== userId);
  state.jobs = state.jobs.filter((job) => job.userId !== userId);
  state.applications = state.applications.filter((application) => application.userId !== userId);
  state.documents = state.documents.filter((doc) => doc.meta.userId !== userId);
}

// ------------------------------------------------------------------ auth

function signIn(ctx: Ctx, email: string, password: string): Session {
  const mail = email.trim().toLowerCase();
  if (mail === '' || password === '') throw apiError('validation', 'Email and password are required.');
  const user = ctx.state.users.find((candidate) => candidate.email === mail);
  if (user === undefined) throw apiError('unauthenticated', 'Invalid login credentials.');
  if (user.banned) throw apiError('forbidden', 'This account is banned.');
  user.lastSignInAt = ctx.clock();
  ctx.state.currentUserId = user.id;
  notify(ctx);
  return toSession(user);
}

function signOut(ctx: Ctx): void {
  ctx.state.currentUserId = null;
  notify(ctx);
}

function changePassword(ctx: Ctx, newPassword: string): void {
  const user = requireUser(ctx);
  if (newPassword === '') throw apiError('validation', 'The new password must not be empty.');
  user.mustChangePassword = false;
  notify(ctx);
}

function deleteMyAccount(ctx: Ctx): void {
  const user = requireUser(ctx);
  const otherAdmins = ctx.state.users.filter((other) => other.role === 'admin' && other.id !== user.id && !other.banned);
  if (user.role === 'admin' && otherAdmins.length === 0) {
    throw apiError('forbidden', 'The last admin cannot delete the account.');
  }
  removeUserData(ctx.state, user.id);
  ctx.state.currentUserId = null;
  notify(ctx);
}

function exportMyData(ctx: Ctx): Blob {
  const user = requireUser(ctx);
  const data = {
    profile: ctx.state.profiles.find((profile) => profile.userId === user.id) ?? null,
    jobs: ctx.state.jobs.filter((job) => job.userId === user.id),
    applications: ctx.state.applications.filter((application) => application.userId === user.id),
    documents: ctx.state.documents.filter((doc) => doc.meta.userId === user.id).map((doc) => doc.meta),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

function buildAuth(ctx: Ctx): AuthApi {
  return {
    getSession: asyncify(() => currentSession(ctx)),
    onAuthChange: (callback) => {
      ctx.listeners.add(callback);
      return () => {
        ctx.listeners.delete(callback);
      };
    },
    signIn: asyncify((email: string, password: string) => signIn(ctx, email, password)),
    signOut: asyncify(() => signOut(ctx)),
    changePassword: asyncify((newPassword: string) => changePassword(ctx, newPassword)),
    deleteMyAccount: asyncify(() => deleteMyAccount(ctx)),
    exportMyData: asyncify(() => exportMyData(ctx)),
  };
}

// ------------------------------------------------------------------ jobs

function ownJob(ctx: Ctx, id: string): Job {
  const user = requireUser(ctx);
  const job = ctx.state.jobs.find((candidate) => candidate.userId === user.id && candidate.id === id);
  if (job === undefined) throw apiError('not_found', 'Job not found.');
  return job;
}

function matchesSearch(job: Job, needle: string): boolean {
  return [job.title, job.company, job.location].some((field) => field.toLowerCase().includes(needle));
}

function listJobs(ctx: Ctx, query: JobListQuery = {}): Job[] {
  const user = requireUser(ctx);
  const since = parseBound(query.since);
  const until = parseBound(query.until);
  const needle = query.search?.trim().toLowerCase() ?? '';
  const matching = ctx.state.jobs.filter(
    (job) =>
      job.userId === user.id &&
      (query.status === undefined || job.status === query.status) &&
      inRange(job.firstSeenAt, since, until) &&
      matchesSearch(job, needle),
  );
  return copy(newestFirst(matching, (job) => job.firstSeenAt));
}

function setJobStatus(ctx: Ctx, id: string, status: JobStatus): Job {
  const job = ownJob(ctx, id);
  job.status = status;
  return copy(job);
}

function addManualJob(ctx: Ctx, input: ManualJobInput): Job {
  const user = requireUser(ctx);
  const prepared = prepareManualJob(input);
  const id = jobId(prepared.company, prepared.title, prepared.location);
  if (ctx.state.jobs.some((job) => job.userId === user.id && job.id === id)) {
    throw apiError('conflict', 'This job already exists.');
  }
  const job: Job = {
    ...prepared,
    id,
    userId: user.id,
    source: MANUAL_SOURCE,
    firstSeenAt: ctx.clock(),
    status: 'new',
    recommendedDocumentIds: [],
  };
  ctx.state.jobs.push(job);
  return copy(job);
}

function buildJobs(ctx: Ctx): JobsApi {
  return {
    list: asyncify((query?: JobListQuery) => listJobs(ctx, query)),
    get: asyncify((id: string) => copy(ownJob(ctx, id))),
    setStatus: asyncify((id: string, status: JobStatus) => setJobStatus(ctx, id, status)),
    addManual: asyncify((input: ManualJobInput) => addManualJob(ctx, input)),
  };
}

// ------------------------------------------------------------------ applications

const PATCH_KEYS = ['appliedAt', 'cvDocumentId', 'letterDocumentId', 'cvLabel', 'notes', 'stage'] as const;

function ownApplication(ctx: Ctx, id: string): Application {
  const user = requireUser(ctx);
  const application = ctx.state.applications.find((candidate) => candidate.userId === user.id && candidate.id === id);
  if (application === undefined) throw apiError('not_found', 'Application not found.');
  return application;
}

function assertOwnDocument(ctx: Ctx, userId: string, documentId: string | null | undefined): void {
  if (!documentId) return;
  if (!ctx.state.documents.some((doc) => doc.meta.userId === userId && doc.meta.id === documentId)) {
    throw apiError('validation', 'The selected document does not exist.');
  }
}

function listApplications(ctx: Ctx, query: ApplicationListQuery = {}): Application[] {
  const user = requireUser(ctx);
  const since = parseBound(query.since);
  const until = parseBound(query.until);
  const matching = ctx.state.applications.filter(
    (application) => application.userId === user.id && inRange(application.appliedAt, since, until),
  );
  return copy(newestFirst(matching, (application) => application.appliedAt));
}

function applyToJob(ctx: Ctx, input: ApplyInput): Application {
  const user = requireUser(ctx);
  const job = ownJob(ctx, input.jobId);
  if (ctx.state.applications.some((application) => application.userId === user.id && application.jobId === job.id)) {
    throw apiError('conflict', 'You already applied to this job.');
  }
  assertOwnDocument(ctx, user.id, input.cvDocumentId);
  assertOwnDocument(ctx, user.id, input.letterDocumentId);
  const application: Application = {
    id: ctx.newId(),
    userId: user.id,
    jobId: job.id,
    appliedAt: ctx.clock(),
    cvDocumentId: input.cvDocumentId,
    letterDocumentId: input.letterDocumentId,
    cvLabel: input.cvLabel,
    notes: input.notes,
    stage: 'applied',
  };
  job.status = 'applied';
  ctx.state.applications.push(application);
  return copy(application);
}

function validatePatch(ctx: Ctx, userId: string, patch: ApplicationPatch): void {
  parseBound(patch.appliedAt);
  assertOwnDocument(ctx, userId, patch.cvDocumentId);
  assertOwnDocument(ctx, userId, patch.letterDocumentId);
  if (patch.stage !== undefined && !APPLICATION_STAGES.includes(patch.stage)) {
    throw apiError('validation', 'Unknown application stage.');
  }
}

function updateApplication(ctx: Ctx, id: string, patch: ApplicationPatch): Application {
  const application = ownApplication(ctx, id);
  validatePatch(ctx, application.userId, patch);
  for (const key of PATCH_KEYS) {
    const value = patch[key];
    if (value !== undefined) Object.assign(application, { [key]: value });
  }
  return copy(application);
}

function removeApplication(ctx: Ctx, id: string): void {
  const application = ownApplication(ctx, id);
  ctx.state.applications = ctx.state.applications.filter((candidate) => candidate !== application);
  const job = ctx.state.jobs.find((candidate) => candidate.userId === application.userId && candidate.id === application.jobId);
  if (job?.status === 'applied') job.status = 'new';
}

function buildApplications(ctx: Ctx): ApplicationsApi {
  return {
    list: asyncify((query?: ApplicationListQuery) => listApplications(ctx, query)),
    apply: asyncify((input: ApplyInput) => applyToJob(ctx, input)),
    update: asyncify((id: string, patch: ApplicationPatch) => updateApplication(ctx, id, patch)),
    remove: asyncify((id: string) => removeApplication(ctx, id)),
  };
}

// ------------------------------------------------------------------ profile

function getProfile(ctx: Ctx): Profile | null {
  const user = requireUser(ctx);
  const profile = ctx.state.profiles.find((candidate) => candidate.userId === user.id);
  return profile === undefined ? null : copy(profile);
}

function saveProfile(ctx: Ctx, input: ProfileInput): Profile {
  const user = requireUser(ctx);
  const profile: Profile = { ...copy(input), userId: user.id, updatedAt: ctx.clock() };
  ctx.state.profiles = [...ctx.state.profiles.filter((candidate) => candidate.userId !== user.id), profile];
  return copy(profile);
}

function buildProfile(ctx: Ctx): ProfileApi {
  return {
    get: asyncify(() => getProfile(ctx)),
    save: asyncify((input: ProfileInput) => saveProfile(ctx, input)),
  };
}

// ------------------------------------------------------------------ documents

function ownDocument(ctx: Ctx, id: string): StoredDocument {
  const user = requireUser(ctx);
  const doc = ctx.state.documents.find((candidate) => candidate.meta.userId === user.id && candidate.meta.id === id);
  if (doc === undefined) throw apiError('not_found', 'Document not found.');
  return doc;
}

function listDocuments(ctx: Ctx, query: DocumentListQuery = {}): DocumentMeta[] {
  const user = requireUser(ctx);
  const matching = ctx.state.documents
    .map((doc) => doc.meta)
    .filter((meta) => meta.userId === user.id && (query.kind === undefined || meta.kind === query.kind));
  return copy(newestFirst(matching, (meta) => meta.createdAt));
}

function uploadDocument(ctx: Ctx, file: File, options: UploadOptions): DocumentMeta {
  const user = requireUser(ctx);
  const mime = validateUpload(file);
  const templates = ctx.state.documents.filter((doc) => doc.meta.userId === user.id && doc.meta.kind === 'template');
  if (options.kind === 'template' && templates.length >= MAX_TEMPLATES) {
    throw apiError('template_limit', `You can keep at most ${MAX_TEMPLATES} templates.`);
  }
  const id = ctx.newId();
  const createdAt = ctx.clock();
  const meta: DocumentMeta = {
    id,
    userId: user.id,
    jobId: options.jobId ?? null,
    kind: options.kind,
    filename: file.name,
    mime,
    sizeBytes: file.size,
    storagePath: storagePathFor(user.id, id, file.name),
    createdAt,
    expiresAt: expiresAtFor(options.kind, createdAt),
  };
  ctx.state.documents.push({ meta, blob: file });
  return copy(meta);
}

function removeDocument(ctx: Ctx, id: string): void {
  const doc = ownDocument(ctx, id);
  ctx.state.documents = ctx.state.documents.filter((candidate) => candidate !== doc);
  for (const application of ctx.state.applications) {
    if (application.cvDocumentId === id) application.cvDocumentId = null;
    if (application.letterDocumentId === id) application.letterDocumentId = null;
  }
}

function buildDocuments(ctx: Ctx): DocumentsApi {
  return {
    list: asyncify((query?: DocumentListQuery) => listDocuments(ctx, query)),
    upload: asyncify((file: File, options: UploadOptions) => uploadDocument(ctx, file, options)),
    signedUrl: asyncify((id: string) => ctx.objectUrl(ownDocument(ctx, id).blob)),
    remove: asyncify((id: string) => removeDocument(ctx, id)),
    standardTemplates: asyncify(standardTemplates),
  };
}

// ------------------------------------------------------------------ admin

// The caller is always an admin, so a demotion/ban/delete of someone else can never remove the last admin; the
// last-admin rule only bites in deleteMyAccount.
function adminTarget(ctx: Ctx, id: string): MockUser {
  const caller = requireAdmin(ctx);
  const target = ctx.state.users.find((user) => user.id === id);
  if (target === undefined) throw apiError('not_found', 'User not found.');
  if (target.id === caller.id) throw apiError('forbidden', 'You cannot change your own account here.');
  return target;
}

function createUser(ctx: Ctx, input: CreateUserInput): AdminUser {
  requireAdmin(ctx);
  const email = input.email.trim().toLowerCase();
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) throw apiError('validation', 'Enter a valid email address.');
  if (input.tempPassword === '') throw apiError('validation', 'The temporary password must not be empty.');
  if (ctx.state.users.some((user) => user.email === email)) {
    throw apiError('conflict', 'A user with this email already exists.');
  }
  const user: MockUser = {
    id: ctx.newId(),
    email,
    role: input.role,
    createdAt: ctx.clock(),
    lastSignInAt: null,
    banned: false,
    mustChangePassword: true,
  };
  ctx.state.users.push(user);
  return toAdminUser(user);
}

function setRole(ctx: Ctx, id: string, role: Role): AdminUser {
  const target = adminTarget(ctx, id);
  target.role = role;
  return toAdminUser(target);
}

function setBanned(ctx: Ctx, id: string, banned: boolean): AdminUser {
  const target = adminTarget(ctx, id);
  target.banned = banned;
  return toAdminUser(target);
}

function deleteUser(ctx: Ctx, id: string): void {
  removeUserData(ctx.state, adminTarget(ctx, id).id);
}

function buildAdmin(ctx: Ctx): AdminApi {
  return {
    listUsers: asyncify(() => {
      requireAdmin(ctx);
      return ctx.state.users.map(toAdminUser);
    }),
    createUser: asyncify((input: CreateUserInput) => createUser(ctx, input)),
    setRole: asyncify((id: string, role: Role) => setRole(ctx, id, role)),
    setBanned: asyncify((id: string, banned: boolean) => setBanned(ctx, id, banned)),
    deleteUser: asyncify((id: string) => deleteUser(ctx, id)),
  };
}

// ------------------------------------------------------------------ factory

function createState(now: Date): MockState {
  const seed = createSeed(now);
  return {
    currentUserId: null,
    users: seed.users,
    profiles: [seed.profile],
    jobs: seed.jobs,
    applications: seed.applications,
    documents: seed.documents.map((meta) => ({
      meta,
      blob: new Blob([`Fictional demo document: ${meta.filename}`], { type: meta.mime }),
    })),
  };
}

export function createMockApi(options: MockApiOptions = {}): DataApi {
  const now = options.now ?? (() => new Date());
  const ctx: Ctx = {
    state: createState(now()),
    clock: () => now().toISOString(),
    newId: options.newId ?? (() => crypto.randomUUID()),
    objectUrl: options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob)),
    listeners: new Set(),
  };
  return {
    auth: buildAuth(ctx),
    jobs: buildJobs(ctx),
    applications: buildApplications(ctx),
    profile: buildProfile(ctx),
    documents: buildDocuments(ctx),
    admin: buildAdmin(ctx),
  };
}
