import type { DocumentMeta } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { ConfirmDialog } from './ConfirmDialog';

interface DeleteDocumentDialogProps {
  doc: DocumentMeta;
  onDeleted: (doc: DocumentMeta) => void;
  onClose: () => void;
}

export function DeleteDocumentDialog({ doc, onDeleted, onClose }: Readonly<DeleteDocumentDialogProps>) {
  const api = useApi();
  const { busy, error, run } = useAction();
  return (
    <ConfirmDialog
      title="Delete this document?"
      message={`Delete ${doc.filename}? This cannot be undone. Applications that used it keep its name.`}
      confirmLabel="Delete document"
      busy={busy}
      error={error}
      onConfirm={() =>
        void run(async () => {
          await api.documents.remove(doc.id);
          onDeleted(doc);
        })
      }
      onCancel={onClose}
    />
  );
}
