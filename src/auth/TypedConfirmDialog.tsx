import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  description: ReactNode;
  /** What the person must type (compared case-insensitively, trimmed) before the destructive button unlocks. */
  phrase: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native modal <dialog> asking for a typed confirmation. Mount it to open it, unmount it to close it. */
export function TypedConfirmDialog({
  title,
  description,
  phrase,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: Readonly<Props>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  const errorId = useId();
  const matches = typed.trim().toLowerCase() === phrase.toLowerCase();

  useEffect(() => {
    const dialog = dialogRef.current as HTMLDialogElement;
    dialog.showModal();
    (inputRef.current as HTMLInputElement).focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        className="auth-stack"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <div>{description}</div>
        <label>
          Type <strong>{phrase}</strong> to confirm
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={error === null ? undefined : errorId}
          />
        </label>
        {error !== null && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={!matches || busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
