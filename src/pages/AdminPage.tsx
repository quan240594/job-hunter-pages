import { useState } from 'react';
import type { AdminUser } from '../api';
import { describeError } from '../auth/apiError';
import { useAuth, useSession } from '../auth/context';
import { TypedConfirmDialog } from '../auth/TypedConfirmDialog';
import { CreateUserForm } from './admin/CreateUserForm';
import { UsersTable } from './admin/UsersTable';
import { useAdminUsers } from './admin/useAdminUsers';

// The backend answers both guards (own account, last admin) with 'forbidden'.
const ACTION_TEXTS = {
  forbidden: 'Not allowed: you cannot change your own account, and the last remaining admin cannot be demoted, banned or deleted.',
  not_found: 'That user no longer exists. The list was refreshed.',
};

export function AdminPage() {
  const session = useSession();
  const { api } = useAuth();
  const { state, reload, retry } = useAdminUsers(api.admin);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // No optimistic updates: the list is refetched after every action, successful or not.
  const run = async (user: AdminUser, action: () => Promise<unknown>, done: string) => {
    setBusyId(user.id);
    setNotice(null);
    setActionError(null);
    try {
      await action();
      setNotice(done);
    } catch (error_) {
      setActionError(describeError(error_, ACTION_TEXTS));
    }
    await reload();
    setBusyId(null);
  };

  const toggleRole = (user: AdminUser) => {
    const role = user.role === 'admin' ? 'user' : 'admin';
    return run(user, () => api.admin.setRole(user.id, role), `${user.email} is now ${role === 'admin' ? 'an admin' : 'a regular user'}.`);
  };

  const toggleBan = (user: AdminUser) =>
    run(user, () => api.admin.setBanned(user.id, !user.banned), `${user.email} was ${user.banned ? 'unbanned' : 'banned'}.`);

  const closeDialog = () => {
    setDeleting(null);
    setDeleteError(null);
  };

  const confirmDelete = async (user: AdminUser) => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.admin.deleteUser(user.id);
    } catch (error_) {
      setDeleteError(describeError(error_, ACTION_TEXTS));
      setDeleteBusy(false);
      return;
    }
    setDeleteBusy(false);
    setDeleting(null);
    setActionError(null);
    setNotice(`${user.email} and all their data were deleted.`);
    await reload();
  };

  return (
    <section aria-labelledby="admin-title">
      <h1 id="admin-title">Admin</h1>
      <p>
        <strong>Privacy:</strong> admins manage accounts only. You cannot see other users&apos; jobs, CVs, letters,
        applications or any other data, and nobody can give you access to it.
      </p>

      <CreateUserForm admin={api.admin} onCreated={reload} />

      <section aria-labelledby="users-title">
        <h2 id="users-title">Users</h2>
        {notice !== null && <output>{notice}</output>}
        {actionError !== null && <p role="alert">{actionError}</p>}
        {state.status === 'loading' && <p role="status">Loading users…</p>}
        {state.status === 'error' && (
          <div>
            <p role="alert">{state.text}</p>
            <button type="button" onClick={() => void retry()}>
              Try again
            </button>
          </div>
        )}
        {state.status === 'ready' && (
          <UsersTable
            users={state.users}
            selfId={session.userId}
            busyId={busyId}
            onToggleRole={(user) => void toggleRole(user)}
            onToggleBan={(user) => void toggleBan(user)}
            onDelete={setDeleting}
          />
        )}
      </section>

      {deleting !== null && (
        <TypedConfirmDialog
          title="Delete this user?"
          description={
            <p>
              This permanently deletes <strong>{deleting.email}</strong> together with all of their jobs, applications and
              documents.
            </p>
          }
          phrase={deleting.email}
          confirmLabel="Delete user"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete(deleting)}
          onCancel={closeDialog}
        />
      )}
    </section>
  );
}
