import type { Application, ApplyInput, DocumentKind, DocumentMeta } from '../api';
import { daysUntil, formatBytes } from './format';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_LIMIT = 3;
export const RETENTION_MONTHS = 6;
export const EXPIRY_WARNING_DAYS = 30;
export const ACCEPT_ATTRIBUTE = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED_MIMES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Client-side check before upload; the backend validates again. Returns a message, or null when the file is fine. */
export function validateUpload(file: File): string | null {
  if (!ALLOWED_MIMES.has(file.type)) return 'Only PDF or DOCX files can be uploaded.';
  if (file.size > MAX_UPLOAD_BYTES) return `The file is ${formatBytes(file.size)}; the maximum is 10 MB.`;
  return null;
}

export function documentsOfKind(documents: readonly DocumentMeta[], kind: DocumentKind): DocumentMeta[] {
  return documents.filter((doc) => doc.kind === kind);
}

export function countTemplates(documents: readonly DocumentMeta[]): number {
  return documentsOfKind(documents, 'template').length;
}

export type ExpiryState =
  | { state: 'never' }
  | { state: 'ok'; days: number }
  | { state: 'soon'; days: number }
  | { state: 'expired' };

export function expiryState(doc: DocumentMeta, now: Date): ExpiryState {
  if (doc.expiresAt === null) return { state: 'never' };
  const days = daysUntil(doc.expiresAt, now);
  if (days <= 0) return { state: 'expired' };
  return { state: days < EXPIRY_WARNING_DAYS ? 'soon' : 'ok', days };
}

export function isLive(doc: DocumentMeta, now: Date): boolean {
  return expiryState(doc, now).state !== 'expired';
}

export interface UsedDocument {
  label: string;
  /** True when the document is gone or past its expiry date (the label is kept on the application). */
  expired: boolean;
}

function resolveUsed(
  id: string | null,
  label: string,
  fallback: string,
  documents: readonly DocumentMeta[],
  now: Date,
): UsedDocument | null {
  const doc = documents.find((candidate) => candidate.id === id);
  if (doc !== undefined && isLive(doc, now)) return { label: doc.filename, expired: false };
  if (id === null && label === '') return null;
  return { label: label === '' ? fallback : label, expired: true };
}

export function usedCv(application: Application, documents: readonly DocumentMeta[], now: Date): UsedDocument | null {
  return resolveUsed(application.cvDocumentId, application.cvLabel, 'CV', documents, now);
}

export function usedLetter(application: Application, documents: readonly DocumentMeta[], now: Date): UsedDocument | null {
  return resolveUsed(application.letterDocumentId, '', 'Cover letter', documents, now);
}

export interface ApplyForm {
  cvId: string;
  letterId: string;
  notes: string;
}

export function buildApplyInput(jobId: string, form: ApplyForm, documents: readonly DocumentMeta[]): ApplyInput {
  const cv = documents.find((doc) => doc.id === form.cvId);
  return {
    jobId,
    cvDocumentId: form.cvId === '' ? null : form.cvId,
    letterDocumentId: form.letterId === '' ? null : form.letterId,
    cvLabel: cv?.filename ?? '',
    notes: form.notes.trim(),
  };
}
