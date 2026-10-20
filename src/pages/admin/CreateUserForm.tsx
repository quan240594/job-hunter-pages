import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateUserInput, Role } from '../../api';
import { describeError } from '../../auth/apiError';
import { MIN_PASSWORD_LENGTH, generatePassword } from '../../auth/password';
import type { AdminApi } from './useAdminUsers';

interface Props {
  admin: AdminApi;
  /** Called after a successful creation so the page can refetch the list. */
  onCreated: () => Promise<void>;
}

interface Created {
  email: string;
  /** Only set when the account was created with a temporary password (shown once). */
  tempPassword: string | null;
}

interface Problem {
  field: 'password' | 'form';
  text: string;
}

const CREATE_TEXTS = {
  conflict: 'An account with that email address already exists.',
  validation: 'Check the email address and the temporary password, then try again.',
  forbidden: 'Only admins can create accounts.',
};

function TempPassword({ password, onHide }: Readonly<{ password: string; onHide: () => void }>) {
  const [copied, setCopied] = useState<boolean | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <p>
        <code>{password}</code>
      </p>
      <button type="button" onClick={() => void copy()}>
        Copy password
      </button>{' '}
      <button type="button" onClick={onHide}>
        Hide password
      </button>
      {copied === true && <output>Copied to the clipboard.</output>}
      {copied === false && <p role="alert">Could not copy. Select the password and copy it by hand.</p>}
    </div>
  );
}

type Mode = 'password' | 'invite';

export function CreateUserForm({ admin, onCreated }: Readonly<Props>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [mode, setMode] = useState<Mode>('password');
  const [tempPassword, setTempPassword] = useState(generatePassword);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCreated(null);
    if (mode === 'password' && tempPassword.length < MIN_PASSWORD_LENGTH) {
      setProblem({ field: 'password', text: `A temporary password needs at least ${MIN_PASSWORD_LENGTH} characters.` });
      (passwordRef.current as HTMLInputElement).focus();
      return;
    }
    setProblem(null);
    setBusy(true);
    const input: CreateUserInput = { email: email.trim(), role };
    if (mode === 'password') input.tempPassword = tempPassword;
    try {
      await admin.createUser(input);
    } catch (error_) {
      setProblem({ field: 'form', text: describeError(error_, CREATE_TEXTS) });
      setBusy(false);
      return;
    }
    setCreated({ email: input.email, tempPassword: input.tempPassword ?? null });
    setEmail('');
    setRole('user');
    setTempPassword(generatePassword());
    setBusy(false);
    await onCreated();
  };

  const hasPasswordProblem = problem?.field === 'password';

  return (
    <section aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>Create a user</h2>
      <form className="auth-stack" onSubmit={submit} noValidate>
        <label>
          Email
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <fieldset>
          <legend>How does the person get access?</legend>
          <label>
            <input type="radio" name={`${baseId}-mode`} checked={mode === 'password'} onChange={() => setMode('password')} />
            Create with a temporary password (recommended)
          </label>
          <label>
            <input type="radio" name={`${baseId}-mode`} checked={mode === 'invite'} onChange={() => setMode('invite')} />
            Send invite email
          </label>
          <p className="muted">Requires custom SMTP to be configured; otherwise use a temporary password.</p>
        </fieldset>
        {mode === 'password' && (
          <>
            <label>
              Temporary password
              <input
                ref={passwordRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                required
                value={tempPassword}
                onChange={(event) => setTempPassword(event.target.value)}
                aria-invalid={hasPasswordProblem}
                aria-describedby={hasPasswordProblem ? `${helpId} ${errorId}` : helpId}
              />
            </label>
            <button type="button" onClick={() => setTempPassword(generatePassword())}>
              Generate new password
            </button>
            <p id={helpId} className="muted">
              You will see it once after creating the account; share it with the person. They must choose their own
              password at the first sign-in.
            </p>
          </>
        )}
        {problem !== null && (
          <p id={errorId} role="alert">
            {problem.text}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {mode === 'password' ? 'Create user with temporary password' : 'Send invite email'}
        </button>
      </form>
      {created !== null && (
        <div>
          <output>
            {created.tempPassword === null
              ? `Invite email sent to ${created.email}.`
              : `Account created for ${created.email}. The temporary password is shown only once.`}
          </output>
          {created.tempPassword !== null && (
            <TempPassword password={created.tempPassword} onHide={() => setCreated(null)} />
          )}
        </div>
      )}
    </section>
  );
}
