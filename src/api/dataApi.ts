// The single data-access interface of the UI. Owned by the scaffold; implementations: mockApi.ts, supabaseApi.ts.
// Every method rejects with an ApiError (see types.ts). Interfaces only: no runtime code.
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
  StandardTemplate,
  UploadOptions,
} from './types';

export interface AuthApi {
  /** null when signed out. */
  getSession(): Promise<Session | null>;
  /** Subscribes to sign-in/sign-out/token changes. Returns the unsubscribe function. */
  onAuthChange(callback: (session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Also clears the must_change_password flag. */
  changePassword(newPassword: string): Promise<void>;
  /** Deletes the auth user, all rows and all storage objects of the caller. */
  deleteMyAccount(): Promise<void>;
  /** JSON Blob with the caller's profile, jobs, applications and document metadata. */
  exportMyData(): Promise<Blob>;
}

export interface JobsApi {
  list(query?: JobListQuery): Promise<Job[]>;
  get(id: string): Promise<Job>;
  setStatus(id: string, status: JobStatus): Promise<Job>;
  /** Rejects with 'conflict' when the same company/title/location already exists for the user. */
  addManual(input: ManualJobInput): Promise<Job>;
}

export interface ApplicationsApi {
  list(query?: ApplicationListQuery): Promise<Application[]>;
  /** Creates the application and sets the job status to 'applied'. */
  apply(input: ApplyInput): Promise<Application>;
  update(id: string, patch: ApplicationPatch): Promise<Application>;
  /** Deletes the application and sets the job back to 'new' when it was 'applied'. */
  remove(id: string): Promise<void>;
}

export interface ProfileApi {
  /** null until the user saved a profile for the first time. */
  get(): Promise<Profile | null>;
  save(profile: ProfileInput): Promise<Profile>;
}

export interface DocumentsApi {
  list(query?: DocumentListQuery): Promise<DocumentMeta[]>;
  /** Rejects with 'validation' (size > 10 MB, mime not pdf/docx) or 'template_limit' (4th template). */
  upload(file: File, options: UploadOptions): Promise<DocumentMeta>;
  /** URL valid for 60 seconds. */
  signedUrl(id: string): Promise<string>;
  remove(id: string): Promise<void>;
  /** The built-in read-only templates (static assets). */
  standardTemplates(): Promise<StandardTemplate[]>;
}

/** Backed by the Edge Function `admin-users`. Every call rejects with 'forbidden' unless the caller is an admin. */
export interface AdminApi {
  listUsers(): Promise<AdminUser[]>;
  createUser(input: CreateUserInput): Promise<AdminUser>;
  setRole(id: string, role: Role): Promise<AdminUser>;
  setBanned(id: string, banned: boolean): Promise<AdminUser>;
  /** Also deletes all of that user's rows and storage objects. */
  deleteUser(id: string): Promise<void>;
}

export interface DataApi {
  auth: AuthApi;
  jobs: JobsApi;
  applications: ApplicationsApi;
  profile: ProfileApi;
  documents: DocumentsApi;
  admin: AdminApi;
}
