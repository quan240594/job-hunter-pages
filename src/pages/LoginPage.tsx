import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { describeError } from '../auth/apiError';
import type { ErrorTexts } from '../auth/apiError';
import { useAuth } from '../auth/context';
import { returnPathFrom } from '../auth/paths';

// One wording for every credential problem (wrong password, unknown email, disabled account): no user enumeration.
const REJECTED = 'Email or password is incorrect, or this account cannot sign in.';
const LOGIN_TEXTS: ErrorTexts = {
  unauthenticated: REJECTED,
  forbidden: REJECTED,
  not_found: REJECTED,
  validation: REJECTED,
  conflict: REJECTED,
};

export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  if (state.status === 'authenticated') return <Navigate to={returnPathFrom(location.state)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (error_) {
      setError(describeError(error_, LOGIN_TEXTS));
      setBusy(false);
    }
  };

  const describedBy = error === null ? undefined : errorId;

  return (
    <main className="login">
      <h1>Job Hunter</h1>
      <p className="muted">
        Sign in with the account you were invited with. There is no sign-up page: accounts are created by an admin.
      </p>
      {state.status === 'loading' && <output>Checking your session…</output>}
      {state.status === 'error' && <p role="alert">{describeError(state.error)}</p>}
      {state.status !== 'loading' && (
        <form onSubmit={submit} aria-label="Sign in">
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={describedBy}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={describedBy}
            />
          </label>
          {error !== null && (
            <p id={errorId} role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      <p className="muted">
        Forgot your password? Ask an admin to set a temporary password for you; you will choose a new one the next time
        you sign in.
      </p>
    </main>
  );
}
