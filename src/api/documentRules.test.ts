import {
  addMonths,
  DOCX_MIME,
  expiresAtFor,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
  storageFileName,
  storagePathFor,
  validateUpload,
} from './documentRules';

describe('validateUpload', () => {
  it('accepts pdf and docx up to 10 MB', () => {
    expect(validateUpload({ type: PDF_MIME, size: 1 })).toBe(PDF_MIME);
    expect(validateUpload({ type: DOCX_MIME, size: MAX_UPLOAD_BYTES })).toBe(DOCX_MIME);
  });

  it('rejects other mime types and oversized files with validation', () => {
    expect(() => validateUpload({ type: 'image/png', size: 1 })).toThrow(expect.objectContaining({ code: 'validation' }));
    expect(() => validateUpload({ type: '', size: 1 })).toThrow(expect.objectContaining({ code: 'validation' }));
    expect(() => validateUpload({ type: PDF_MIME, size: 0 })).toThrow(
      expect.objectContaining({ code: 'validation', message: 'The file is empty.' }),
    );
    expect(() => validateUpload({ type: PDF_MIME, size: MAX_UPLOAD_BYTES + 1 })).toThrow(
      expect.objectContaining({ code: 'validation', message: 'The file is larger than 10 MB.' }),
    );
  });

  it('exposes the mime check', () => {
    expect(isAllowedMime(PDF_MIME)).toBe(true);
    expect(isAllowedMime('text/plain')).toBe(false);
  });
});

describe('addMonths', () => {
  it('adds calendar months', () => {
    expect(addMonths('2026-01-15T10:00:00.000Z', 6)).toBe('2026-07-15T10:00:00.000Z');
    expect(addMonths('2026-08-20T10:00:00.000Z', 6)).toBe('2027-02-20T10:00:00.000Z');
  });

  it('clamps the day of month like Postgres', () => {
    expect(addMonths('2026-08-31T10:00:00.000Z', 6)).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths('2027-08-31T10:00:00.000Z', 6)).toBe('2028-02-29T10:00:00.000Z');
  });
});

describe('expiresAtFor', () => {
  it('is +6 months for cv and letter and null for templates', () => {
    expect(expiresAtFor('cv', '2026-01-15T00:00:00.000Z')).toBe('2026-07-15T00:00:00.000Z');
    expect(expiresAtFor('letter', '2026-01-15T00:00:00.000Z')).toBe('2026-07-15T00:00:00.000Z');
    expect(expiresAtFor('template', '2026-01-15T00:00:00.000Z')).toBeNull();
  });
});

describe('storage paths', () => {
  it('replaces characters that storage keys do not accept', () => {
    expect(storageFileName('CV Álex (final).pdf')).toBe('CV__lex__final_.pdf');
    expect(storageFileName('cv.pdf')).toBe('cv.pdf');
    expect(storageFileName('')).toBe('document');
  });

  it('builds {user}/{document}/{filename}', () => {
    expect(storagePathFor('u1', 'd1', 'my cv.pdf')).toBe('u1/d1/my_cv.pdf');
  });
});
