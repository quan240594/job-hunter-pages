import type { AdminUser } from '../../api';

interface Handlers {
  onToggleRole: (user: AdminUser) => void;
  onToggleBan: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

interface Props extends Handlers {
  users: readonly AdminUser[];
  /** The signed-in admin: their own row has no actions (the backend refuses them anyway). */
  selfId: string;
  /** Row whose action is running; its buttons are disabled. */
  busyId: string | null;
}

const formatDate = (iso: string) => iso.slice(0, 10);
const formatDateTime = (iso: string | null) => (iso === null ? 'Never' : iso.slice(0, 16).replace('T', ' '));

function RowActions({
  user,
  busy,
  onToggleRole,
  onToggleBan,
  onDelete,
}: Readonly<Handlers & { user: AdminUser; busy: boolean }>) {
  const roleLabel = user.role === 'admin' ? 'Demote' : 'Promote';
  const banLabel = user.banned ? 'Unban' : 'Ban';
  return (
    <div className="row-actions">
      <button type="button" disabled={busy} aria-label={`${roleLabel} ${user.email}`} onClick={() => onToggleRole(user)}>
        {roleLabel}
      </button>
      <button type="button" disabled={busy} aria-label={`${banLabel} ${user.email}`} onClick={() => onToggleBan(user)}>
        {banLabel}
      </button>
      <button
        type="button"
        className="danger"
        disabled={busy}
        aria-label={`Delete ${user.email}`}
        onClick={() => onDelete(user)}
      >
        Delete
      </button>
    </div>
  );
}

export function UsersTable({ users, selfId, busyId, ...handlers }: Readonly<Props>) {
  return (
    <table className="users-table">
      <caption>Accounts ({users.length})</caption>
      <thead>
        <tr>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col">Created</th>
          <th scope="col">Last sign-in</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <th scope="row">
              {user.email}
              {user.id === selfId && <span className="muted"> (you)</span>}
            </th>
            <td>{user.role}</td>
            <td>
              <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
            </td>
            <td>{formatDateTime(user.lastSignInAt)}</td>
            <td>{user.banned ? 'Banned' : 'Active'}</td>
            <td>
              {user.id === selfId ? (
                <span className="muted">Your own account cannot be changed here</span>
              ) : (
                <RowActions user={user} busy={busyId === user.id} {...handlers} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
