import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { describeError } from './apiError';
import { useAuth } from './context';
import { MIN_PASSWORD_LENGTH, checkPassword } from './password';

type Field = 'password' | 'confirm' | 'form';
interface Problem {
  field: Field;
  text: string;
}

const CHANGE_FAILED_TEXTS = {
  validation: `That password was not accepted. Choose a different one of at least ${MIN_PASSWORD_LENGTH} characters.`,
  unauthenticated: 'Your session has expired. Sign in again, then change your password.',
};

/** Change-password form shared by the forced first-login page and the Account page. */
export function PasswordForm() {
  const { api, refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const hintsId = `${baseId}-hints`;
  const errorId = (field: Field) => `${baseId}-error-${field}`;
  const report = checkPassword(password);

  const reject = (field: Field, text: string) => {
    setProblem({ field, text });
    if (field === 'password') (passwordRef.current as HTMLInputElement).focus();
    if (field === 'confirm') (confirmRef.current as HTMLInputElement).focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setChanged(false);
    if (!report.acceptable) {
      reject('password', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      reject('confirm', 'The two passwords do not match.');
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await api.auth.changePassword(password);
    } catch (error_) {
      setProblem({ field: 'form', text: describeError(error_, CHANGE_FAILED_TEXTS) });
      setBusy(false);
      return;
    }
    setPassword('');
    setConfirm('');
    setChanged(true);
    setBusy(false);
    await refresh();
  };

  const fieldError = (field: Field) =>
    problem?.field === field ? (
      <p id={errorId(field)} role="alert">
        {problem.text}
      </p>
    ) : null;
  const passwordDescribedBy = problem?.field === 'password' ? `${hintsId} ${errorId('password')}` : hintsId;

  return (
    <form className="auth-stack" onSubmit={submit} noValidate>
      <label>
        <span>New password</span>
        <input
          ref={passwordRef}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={problem?.field === 'password'}
          aria-describedby={passwordDescribedBy}
        />
      </label>
      {fieldError('password')}
      <p id={hintsId} className="muted">
        Use a long, unique password. A passphrase of several words works well.
      </p>
      <ul aria-label="Password hints">
        {report.hints.map((hint) => (
          <li key={hint.id}>
            {hint.met ? 'Met' : 'Not met'}: {hint.text}
            {hint.required ? ' (required)' : ''}
          </li>
        ))}
      </ul>
      <output>Strength: {report.strength}</output>
      <label>
        <span>Confirm new password</span>
        <input
          ref={confirmRef}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={problem?.field === 'confirm'}
          aria-describedby={problem?.field === 'confirm' ? errorId('confirm') : undefined}
        />
      </label>
      {fieldError('confirm')}
      {fieldError('form')}
      {changed && <output>Your password was changed.</output>}
      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
