import { createFakeSupabase, failure, ok, opArgs, opNames } from './__fixtures__/fakeSupabase';
import { DOCUMENT_ROW } from './__fixtures__/rows';
import { buildDocuments } from './supabaseDocuments';

const PDF = 'application/pdf';

function setup() {
  const fake = createFakeSupabase();
  const documents = buildDocuments(fake.client, () => 'doc-1');
  return { fake, documents };
}

function pdf(name = 'My CV.pdf', type = PDF, size = 10): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('documents.list', () => {
  it('orders newest first, filters by kind and maps rows', async () => {
    const { fake, documents } = setup();
    fake.respond(ok([DOCUMENT_ROW]), ok([]));
    await expect(documents.list()).resolves.toMatchObject([{ id: 'd1', kind: 'cv', mime: PDF, sizeBytes: 1024 }]);
    expect(opNames(fake.queries[0])).toEqual(['select', 'order']);
    expect(opArgs(fake.queries[0], 'order')).toEqual(['created_at', { ascending: false }]);
    await documents.list({ kind: 'template' });
    expect(opNames(fake.queries[1])).toEqual(['select', 'eq', 'order']);
    expect(opArgs(fake.queries[1], 'eq')).toEqual(['kind', 'template']);
  });
});

describe('documents.upload', () => {
  it('inserts the row, then uploads the file to {user}/{document}/{filename}', async () => {
    const { fake, documents } = setup();
    fake.respond(ok({ ...DOCUMENT_ROW, id: 'doc-1', storage_path: 'u1/doc-1/My_CV.pdf' }));
    const file = pdf();
    await expect(documents.upload(file, { kind: 'cv', jobId: 'j1' })).resolves.toMatchObject({ id: 'doc-1', storagePath: 'u1/doc-1/My_CV.pdf' });
    expect(opArgs(fake.queries[0], 'insert')).toEqual([
      {
        id: 'doc-1',
        user_id: 'u1',
        job_id: 'j1',
        kind: 'cv',
        filename: 'My CV.pdf',
        mime: PDF,
        size_bytes: 10,
        storage_path: 'u1/doc-1/My_CV.pdf',
      },
    ]);
    expect(fake.storage.from).toHaveBeenCalledWith('documents');
    expect(fake.storageBucket.upload).toHaveBeenCalledWith('u1/doc-1/My_CV.pdf', file, { contentType: PDF, upsert: false });
  });

  it('rejects invalid files before any request', async () => {
    const { fake, documents } = setup();
    await expect(documents.upload(pdf('a.png', 'image/png'), { kind: 'cv' })).rejects.toMatchObject({ code: 'validation' });
    await expect(documents.upload(pdf('big.pdf', PDF, 10_485_761), { kind: 'cv' })).rejects.toMatchObject({ code: 'validation' });
    expect(fake.queries).toHaveLength(0);
    expect(fake.auth.getSession).not.toHaveBeenCalled();
  });

  it('needs a session', async () => {
    const { fake, documents } = setup();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(documents.upload(pdf(), { kind: 'cv' })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(fake.queries).toHaveLength(0);
  });

  it('maps the template limit trigger and transfers no file', async () => {
    const { fake, documents } = setup();
    fake.respond(failure({ code: 'P0001', message: 'template_limit' }));
    await expect(documents.upload(pdf(), { kind: 'template' })).rejects.toEqual({ code: 'template_limit', message: 'template_limit' });
    expect(fake.storageBucket.upload).not.toHaveBeenCalled();
  });

  it('removes the row again when the file transfer fails', async () => {
    const { fake, documents } = setup();
    fake.respond(ok({ ...DOCUMENT_ROW, id: 'doc-1' }), ok(null));
    fake.storageBucket.upload.mockResolvedValueOnce({ data: null as never, error: { statusCode: '413', message: 'too large' } });
    await expect(documents.upload(pdf(), { kind: 'cv' })).rejects.toEqual({ code: 'validation', message: 'too large' });
    const rollback = fake.queries[1];
    expect([rollback.table, ...opNames(rollback)]).toEqual(['documents', 'delete', 'eq']);
    expect(opArgs(rollback, 'eq')).toEqual(['id', 'doc-1']);
  });
});

describe('documents.signedUrl', () => {
  it('creates a 60 second signed URL for the stored path', async () => {
    const { fake, documents } = setup();
    fake.respond(ok({ storage_path: 'u1/d1/cv.pdf' }));
    await expect(documents.signedUrl('d1')).resolves.toBe('https://signed.example.com/doc');
    expect(fake.storageBucket.createSignedUrl).toHaveBeenCalledWith('u1/d1/cv.pdf', 60);
    expect(opNames(fake.queries[0])).toEqual(['select', 'eq', 'maybeSingle']);
  });

  it('rejects unknown documents and storage failures', async () => {
    const { fake, documents } = setup();
    fake.respond(ok(null), ok({ storage_path: 'p' }), ok({ storage_path: 'p' }));
    await expect(documents.signedUrl('x')).rejects.toMatchObject({ code: 'not_found' });
    fake.storageBucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: { statusCode: '404', message: 'Object not found' } });
    await expect(documents.signedUrl('d1')).rejects.toMatchObject({ code: 'not_found', message: 'Object not found' });
    fake.storageBucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: null });
    await expect(documents.signedUrl('d1')).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('documents.remove', () => {
  it('removes the object first, then the row', async () => {
    const { fake, documents } = setup();
    fake.respond(ok({ storage_path: 'u1/d1/cv.pdf' }), ok(null));
    await expect(documents.remove('d1')).resolves.toBeUndefined();
    expect(fake.storageBucket.remove).toHaveBeenCalledWith(['u1/d1/cv.pdf']);
    expect(fake.queries.map((query) => [query.table, ...opNames(query)])).toEqual([
      ['documents', 'select', 'eq', 'maybeSingle'],
      ['documents', 'delete', 'eq'],
    ]);
    expect(opArgs(fake.queries[1], 'eq')).toEqual(['id', 'd1']);
  });

  it('rejects unknown documents and keeps the row when the object removal fails', async () => {
    const { fake, documents } = setup();
    fake.respond(ok(null), ok({ storage_path: 'p' }), ok({ storage_path: 'p' }), failure({ code: '42501', message: 'rls' }));
    await expect(documents.remove('x')).rejects.toMatchObject({ code: 'not_found' });
    fake.storageBucket.remove.mockResolvedValueOnce({ data: null as never, error: { statusCode: '403', message: 'denied' } });
    await expect(documents.remove('d1')).rejects.toMatchObject({ code: 'forbidden' });
    expect(fake.queries).toHaveLength(2);
    await expect(documents.remove('d1')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('documents.standardTemplates', () => {
  it('returns the built-in template without any request', async () => {
    const { fake, documents } = setup();
    await expect(documents.standardTemplates()).resolves.toHaveLength(1);
    expect(fake.queries).toHaveLength(0);
  });
});
