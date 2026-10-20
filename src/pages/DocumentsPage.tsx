import { useState } from 'react';
import type { DocumentKind, DocumentMeta } from '../api';
import { useApi } from '../auth/context';
import { DataState } from '../components/DataState';
import { DeleteDocumentDialog } from '../components/DeleteDocumentDialog';
import { DocumentList } from '../components/DocumentList';
import { EmptyState } from '../components/EmptyState';
import { RetentionNote } from '../components/ExpiryInfo';
import { SelectField } from '../components/Field';
import { StandardTemplateCard } from '../components/StandardTemplateCard';
import { UploadForm } from '../components/UploadForm';
import { useAction } from '../hooks/useAction';
import { useDocuments, useNow } from '../hooks/useData';
import { countTemplates } from '../lib/documents';
import { KINDS, KIND_LABELS } from '../lib/labels';

type KindFilter = DocumentKind | 'all';

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  ...KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] })),
];

export function DocumentsPage() {
  const api = useApi();
  const now = useNow();
  const documents = useDocuments();
  const download = useAction();
  const [kind, setKind] = useState<KindFilter>('all');
  const [removing, setRemoving] = useState<DocumentMeta | null>(null);
  const [notice, setNotice] = useState('');
  const { reload } = documents;

  const onDownload = (doc: DocumentMeta) =>
    void download.run(async () => {
      const url = await api.documents.signedUrl(doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    });

  return (
    <section aria-labelledby="documents-heading">
      <h1 id="documents-heading">Documents</h1>
      <RetentionNote />
      <StandardTemplateCard />
      <output className="notice">{notice}</output>
      {download.error === null ? null : (
        <p role="alert" className="form-error">
          {download.error}
        </p>
      )}
      <DataState state={documents} loadingLabel="Loading your documents…">
        {(all) => {
          const shown = kind === 'all' ? all : all.filter((doc) => doc.kind === kind);
          return (
            <>
              <UploadForm
                templateCount={countTemplates(all)}
                onUploaded={(doc) => {
                  setNotice(`Uploaded ${doc.filename}.`);
                  reload();
                }}
              />
              <h2>Your documents</h2>
              <SelectField label="Show" value={kind} options={FILTER_OPTIONS} onChange={setKind} />
              {shown.length === 0 ? (
                <EmptyState title="No documents" hint="Upload a CV, cover letter or template above." />
              ) : (
                <DocumentList documents={shown} now={now} busy={download.busy} onDownload={onDownload} onDelete={setRemoving} />
              )}
            </>
          );
        }}
      </DataState>
      {removing === null ? null : (
        <DeleteDocumentDialog
          doc={removing}
          onDeleted={(doc) => {
            setRemoving(null);
            setNotice(`Deleted ${doc.filename}.`);
            reload();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
