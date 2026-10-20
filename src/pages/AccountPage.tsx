import { useState } from 'react';
import { describeError } from '../auth/apiError';
import { useAuth, useSession } from '../auth/context';
import { downloadBlob } from '../auth/download';
import { PasswordForm } from '../auth/PasswordForm';
import { TypedConfirmDialog } from '../auth/TypedConfirmDialog';

export const DELETE_PHRASE = 'DELETE';

const DELETE_TEXTS = {
  forbidden: 'You are the last admin, so this account cannot be deleted. Make another user an admin first.',
};

type Exporting = { status: 'idle' } | { status: 'busy' } | { status: 'done' } | { status: 'failed'; text: string };

export function AccountPage() {
  const session = useSession();
  const { api, signOut, refresh } = useAuth();
  const [exporting, setExporting] = useState<Exporting>({ status: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const exportData = async () => {
    setExporting({ status: 'busy' });
    try {
      downloadBlob(await api.auth.exportMyData(), `job-hunter-export-${new Date().toISOString().slice(0, 10)}.json`);
      setExporting({ status: 'done' });
    } catch (error_) {
      setExporting({ status: 'failed', text: describeError(error_) });
    }
  };

  const closeDialog = () => {
    setConfirming(false);
    setDeleteError(null);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.auth.deleteMyAccount();
    } catch (error_) {
      setDeleteError(describeError(error_, DELETE_TEXTS));
      setDeleting(false);
      return;
    }
    await signOut().catch(() => refresh());
  };

  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title">Account</h1>
      <dl>
        <dt>Email</dt>
        <dd>{session.email}</dd>
        <dt>Role</dt>
        <dd>{session.role}</dd>
      </dl>

      <section aria-labelledby="password-title">
        <h2 id="password-title">Change password</h2>
        <PasswordForm />
      </section>

      <section aria-labelledby="export-title">
        <h2 id="export-title">Your data</h2>
        <p>Download everything stored about you (profile, jobs, applications and document details) as a JSON file.</p>
        <button type="button" onClick={() => void exportData()} disabled={exporting.status === 'busy'}>
          {exporting.status === 'busy' ? 'Preparing…' : 'Export my data'}
        </button>
        {exporting.status === 'done' && <output>Your export was downloaded.</output>}
        {exporting.status === 'failed' && <p role="alert">{exporting.text}</p>}
      </section>

      <section aria-labelledby="delete-title">
        <h2 id="delete-title">Delete account</h2>
        <p>
          This permanently removes your account and all your data: profile, jobs, applications and uploaded documents.
          It cannot be undone.
        </p>
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          Delete my account and all my data
        </button>
      </section>

      {confirming && (
        <TypedConfirmDialog
          title="Delete your account?"
          description={<p>Everything you stored in Job Hunter is deleted for good, and you are signed out.</p>}
          phrase={DELETE_PHRASE}
          confirmLabel="Delete everything"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void deleteAccount()}
          onCancel={closeDialog}
        />
      )}
    </section>
  );
}
