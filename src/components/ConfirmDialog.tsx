import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, busy, error, onConfirm, onCancel }: Readonly<ConfirmDialogProps>) {
  const footer = (
    <>
      <button type="button" className="btn" onClick={onCancel} data-autofocus>
        Cancel
      </button>
      <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </button>
    </>
  );
  return (
    <Dialog title={title} onClose={onCancel} footer={footer}>
      <p>{message}</p>
      {error === null ? null : (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
