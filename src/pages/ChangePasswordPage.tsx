import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, useSession } from '../auth/context';
import { PasswordForm } from '../auth/PasswordForm';
import { ACCOUNT_PATH, returnPathFrom } from '../auth/paths';

/** Forced first-login screen: the route guard keeps users with mustChangePassword here until they chose a password. */
export function ChangePasswordPage() {
  const session = useSession();
  const { signOut } = useAuth();
  const location = useLocation();

  if (!session.mustChangePassword) {
    return <Navigate to={location.state === null ? ACCOUNT_PATH : returnPathFrom(location.state)} replace />;
  }

  return (
    <main className="login">
      <h1>Choose a new password</h1>
      <p>
        You are signed in as <strong>{session.email}</strong>. Your account was set up with a temporary password, so you
        must choose your own before you continue.
      </p>
      <PasswordForm />
      <p>
        <button type="button" onClick={() => void signOut().catch(() => undefined)}>
          Sign out
        </button>
      </p>
    </main>
  );
}
