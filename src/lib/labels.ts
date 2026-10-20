import type { ApplicationStage, Category, DocumentKind, HybridStatus, JobStatus, LanguageStatus } from '../api';

export const PAGE_SIZE = 50;

export const CATEGORY_LABELS: Record<Category, string> = {
  A: 'Qualified',
  B: 'Dutch needed',
  C: 'Hybrid unclear',
  D: 'Agency',
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: 'New',
  applied: 'Applied',
  skipped: 'Skipped',
};

export const STATUSES = Object.keys(STATUS_LABELS) as JobStatus[];

export const HYBRID_LABELS: Record<HybridStatus, string> = {
  quoted: 'Hybrid or remote quoted',
  unclear: 'Hybrid unclear',
  'office-first': 'Office first',
};

export const LANGUAGE_LABELS: Record<LanguageStatus, string> = {
  english: 'English',
  dutch: 'Dutch',
  unknown: 'Unknown',
};

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const STAGES = Object.keys(STAGE_LABELS) as ApplicationStage[];

export const KIND_LABELS: Record<DocumentKind, string> = {
  cv: 'CV',
  letter: 'Cover letter',
  template: 'Template',
};

export const KINDS = Object.keys(KIND_LABELS) as DocumentKind[];
