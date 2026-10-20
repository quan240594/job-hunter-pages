import type { DocumentsApi } from './dataApi';
import { DOCUMENT_BUCKET, SIGNED_URL_SECONDS, storagePathFor, validateUpload } from './documentRules';
import { apiError } from './errors';
import { documentFromRow, documentToInsertRow, textColumn } from './mappers';
import { standardTemplates } from './standardTemplates';
import { currentUserId, foundOrThrow, guarded, orThrow, rowsOf, type Client } from './supabaseCommon';
import { mapError } from './supabaseErrors';
import type { DocumentListQuery, DocumentMeta, UploadOptions } from './types';

async function listDocuments(client: Client, query: DocumentListQuery = {}): Promise<DocumentMeta[]> {
  let request = client.from('documents').select('*');
  if (query.kind !== undefined) request = request.eq('kind', query.kind);
  return rowsOf(orThrow(await request.order('created_at', { ascending: false }))).map(documentFromRow);
}

// The row goes first: the database trigger enforces the 3-template cap and computes expires_at, so a rejected
// upload never transfers the file. If the file transfer then fails, the row is removed again.
async function uploadDocument(client: Client, newId: () => string, file: File, options: UploadOptions): Promise<DocumentMeta> {
  const mime = validateUpload(file);
  const userId = await currentUserId(client);
  const documentId = newId();
  const storagePath = storagePathFor(userId, documentId, file.name);
  const row = documentToInsertRow(userId, documentId, file, options, storagePath);
  const meta = documentFromRow(orThrow(await client.from('documents').insert(row).select('*').single()));
  const { error } = await client.storage.from(DOCUMENT_BUCKET).upload(storagePath, file, { contentType: mime, upsert: false });
  if (error) {
    await client.from('documents').delete().eq('id', documentId);
    throw mapError(error);
  }
  return meta;
}

async function storagePathOf(client: Client, id: string): Promise<string> {
  const row = orThrow(await client.from('documents').select('storage_path').eq('id', id).maybeSingle());
  return textColumn(foundOrThrow(row, 'Document'), 'storage_path');
}

async function signedUrl(client: Client, id: string): Promise<string> {
  const storagePath = await storagePathOf(client, id);
  const data = orThrow(await client.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS));
  if (typeof data?.signedUrl !== 'string') throw apiError('unknown', 'Unexpected response from the server.');
  return data.signedUrl;
}

// The object goes first: removal is idempotent, so a failed row delete can simply be retried, whereas a row deleted
// before its object would leave an orphan file that no cleanup job looks for.
async function removeDocument(client: Client, id: string): Promise<void> {
  const storagePath = await storagePathOf(client, id);
  orThrow(await client.storage.from(DOCUMENT_BUCKET).remove([storagePath]));
  orThrow(await client.from('documents').delete().eq('id', id));
}

export function buildDocuments(client: Client, newId: () => string): DocumentsApi {
  return {
    list: guarded((query?: DocumentListQuery) => listDocuments(client, query)),
    upload: guarded((file: File, options: UploadOptions) => uploadDocument(client, newId, file, options)),
    signedUrl: guarded((id: string) => signedUrl(client, id)),
    remove: guarded((id: string) => removeDocument(client, id)),
    standardTemplates: guarded(() => Promise.resolve(standardTemplates())),
  };
}
