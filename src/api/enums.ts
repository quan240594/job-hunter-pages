// Closed value sets of the contract, shared by the mock API (input checks) and the row mappers (response checks).
import type {
  ApplicationStage,
  Category,
  DocumentKind,
  Fit,
  HybridStatus,
  JobStatus,
  LanguageStatus,
  Role,
} from './types';

export const JOB_STATUSES: readonly JobStatus[] = ['new', 'applied', 'skipped'];
export const CATEGORIES: readonly Category[] = ['A', 'B', 'C', 'D'];
export const HYBRID_STATUSES: readonly HybridStatus[] = ['quoted', 'unclear', 'office-first'];
export const LANGUAGES: readonly LanguageStatus[] = ['english', 'dutch', 'unknown'];
export const FITS: readonly Fit[] = [0, 1, 2, 3, 4, 5];
export const APPLICATION_STAGES: readonly ApplicationStage[] = ['applied', 'interview', 'offer', 'rejected', 'withdrawn'];
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['cv', 'letter', 'template'];
export const ROLES: readonly Role[] = ['admin', 'user'];
