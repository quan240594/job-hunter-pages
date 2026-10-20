import type { DocumentKind, DocumentMime } from './types';
import { apiError } from './errors';

export const DOCUMENT_BUCKET = 'documents';
export const SIGNED_URL_SECONDS = 60;
export const MAX_UPLOAD_BYTES = 10_485_760;
export const MAX_TEMPLATES = 3;
export const EXPIRY_MONTHS = 6;

export const PDF_MIME: DocumentMime = 'application/pdf';
export const DOCX_MIME: DocumentMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_MIMES: ReadonlySet<string> = new Set<DocumentMime>([PDF_MIME, DOCX_MIME]);

export function isAllowedMime(mime: string): mime is DocumentMime {
  return ALLOWED_MIMES.has(mime);
}

/** Client-side mirror of the database/bucket limits; rejects with 'validation'. */
export function validateUpload(file: Pick<File, 'size' | 'type'>): DocumentMime {
  if (!isAllowedMime(file.type)) throw apiError('validation', 'Only PDF or DOCX files can be uploaded.');
  if (file.size <= 0) throw apiError('validation', 'The file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw apiError('validation', 'The file is larger than 10 MB.');
  return file.type;
}

/** Same arithmetic as Postgres `timestamptz + interval 'n months'`: the day of month is clamped, never overflowed. */
export function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

/** cv/letter expire 6 months after creation, templates never. */
export function expiresAtFor(kind: DocumentKind, createdAt: string): string | null {
  return kind === 'template' ? null : addMonths(createdAt, EXPIRY_MONTHS);
}

/** Keeps the storage key to characters every Storage backend accepts. The original name stays in `filename`. */
export function storageFileName(filename: string): string {
  const cleaned = filename.replaceAll(/[^\w.-]/g, '_');
  return cleaned === '' ? 'document' : cleaned;
}

export function storagePathFor(userId: string, documentId: string, filename: string): string {
  return `${userId}/${documentId}/${storageFileName(filename)}`;
}
