import { makeApplication, makeDocument } from '../__fixtures__/uiFixtures';
import {
  MAX_UPLOAD_BYTES,
  buildApplyInput,
  countTemplates,
  documentsOfKind,
  expiryState,
  isLive,
  usedCv,
  usedLetter,
  validateUpload,
} from './documents';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileOf(type: string, size: number): File {
  const file = new File(['x'], 'cv', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateUpload', () => {
  it('accepts pdf and docx up to 10 MB', () => {
    expect(validateUpload(fileOf(PDF, 1000))).toBeNull();
    expect(validateUpload(fileOf(DOCX, MAX_UPLOAD_BYTES))).toBeNull();
  });

  it('rejects other types and big files', () => {
    expect(validateUpload(fileOf('image/png', 10))).toBe('Only PDF or DOCX files can be uploaded.');
    expect(validateUpload(fileOf(PDF, MAX_UPLOAD_BYTES + 1))).toBe('The file is 10.0 MB; the maximum is 10 MB.');
  });
});

describe('document helpers', () => {
  const cv = makeDocument();
  const template = makeDocument({ id: 'doc-t', kind: 'template', expiresAt: null });

  it('filters by kind and counts templates', () => {
    expect(documentsOfKind([cv, template], 'cv')).toEqual([cv]);
    expect(countTemplates([cv, template, makeDocument({ id: 'doc-t2', kind: 'template', expiresAt: null })])).toBe(2);
  });

  it('classifies expiry', () => {
    expect(expiryState(template, NOW)).toEqual({ state: 'never' });
    expect(expiryState(makeDocument({ expiresAt: '2027-01-01T00:00:00.000Z' }), NOW)).toEqual({ state: 'ok', days: 73 });
    expect(expiryState(makeDocument({ expiresAt: '2026-11-18T10:00:00.000Z' }), NOW)).toEqual({ state: 'soon', days: 29 });
    expect(expiryState(makeDocument({ expiresAt: '2026-11-19T10:00:00.000Z' }), NOW)).toEqual({ state: 'ok', days: 30 });
    expect(expiryState(makeDocument({ expiresAt: '2026-10-20T10:00:00.000Z' }), NOW)).toEqual({ state: 'expired' });
  });

  it('knows which documents are still alive', () => {
    expect(isLive(cv, NOW)).toBe(true);
    expect(isLive(template, NOW)).toBe(true);
    expect(isLive(makeDocument({ expiresAt: '2026-10-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('usedCv and usedLetter', () => {
  const cv = makeDocument();
  const letter = makeDocument({ id: 'doc-letter', kind: 'letter', filename: 'letter.pdf' });
  const expired = makeDocument({ id: 'doc-old', expiresAt: '2026-10-01T00:00:00.000Z' });

  it('shows the live document by its file name', () => {
    expect(usedCv(makeApplication(), [cv], NOW)).toEqual({ label: 'alex-example-cv.pdf', expired: false });
    expect(usedLetter(makeApplication({ letterDocumentId: 'doc-letter' }), [letter], NOW)).toEqual({ label: 'letter.pdf', expired: false });
  });

  it('keeps the label and flags a document that is gone or expired', () => {
    expect(usedCv(makeApplication(), [], NOW)).toEqual({ label: 'alex-example-cv.pdf', expired: true });
    expect(usedCv(makeApplication({ cvDocumentId: 'doc-old' }), [expired], NOW)).toEqual({ label: 'alex-example-cv.pdf', expired: true });
    expect(usedCv(makeApplication({ cvDocumentId: null }), [cv], NOW)).toEqual({ label: 'alex-example-cv.pdf', expired: true });
    expect(usedCv(makeApplication({ cvLabel: '' }), [], NOW)).toEqual({ label: 'CV', expired: true });
    expect(usedLetter(makeApplication({ letterDocumentId: 'doc-letter' }), [], NOW)).toEqual({ label: 'Cover letter', expired: true });
  });

  it('records nothing when no document was used', () => {
    expect(usedCv(makeApplication({ cvDocumentId: null, cvLabel: '' }), [cv], NOW)).toBeNull();
    expect(usedLetter(makeApplication(), [letter], NOW)).toBeNull();
  });
});

describe('buildApplyInput', () => {
  const cv = makeDocument();

  it('copies the CV file name as the label and trims the notes', () => {
    expect(buildApplyInput('job-1', { cvId: 'doc-cv', letterId: 'doc-letter', notes: '  call back  ' }, [cv])).toEqual({
      jobId: 'job-1',
      cvDocumentId: 'doc-cv',
      letterDocumentId: 'doc-letter',
      cvLabel: 'alex-example-cv.pdf',
      notes: 'call back',
    });
  });

  it('uses nulls and an empty label when nothing was picked', () => {
    expect(buildApplyInput('job-1', { cvId: '', letterId: '', notes: '' }, [cv])).toEqual({
      jobId: 'job-1',
      cvDocumentId: null,
      letterDocumentId: null,
      cvLabel: '',
      notes: '',
    });
  });
});
