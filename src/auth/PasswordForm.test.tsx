import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import type { AuthApi } from '../api/dataApi';
import { AuthProvider } from './AuthProvider';
import { PasswordForm } from './PasswordForm';

const STRONG = 'Correct Horse 9 Battery';

function setup(overrides: Partial<AuthApi> = {}) {
  const fake = createFakeApi(ALEX, overrides);
  const user = userEvent.setup();
  render(
    <AuthProvider api={fake.api}>
      <PasswordForm />
    </AuthProvider>,
  );
  return { user, fake };
}

const newPassword = () => screen.getByLabelText('New password');
const confirmation = () => screen.getByLabelText('Confirm new password');
const submit = () => screen.getByRole('button', { name: 'Change password' });

describe('PasswordForm', () => {
  it('labels both fields as new passwords and lists the hints', () => {
    setup();
    expect(newPassword()).toHaveAttribute('type', 'password');
    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmation()).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('list', { name: 'Password hints' })).toHaveTextContent('Not met: At least 12 characters (required)');
    expect(screen.getByText('Strength: Too short')).toBeInTheDocument();
  });

  it('updates the hints and strength while typing', async () => {
    const { user } = setup();
    await user.type(newPassword(), STRONG);
    expect(screen.getByRole('list', { name: 'Password hints' })).toHaveTextContent('Met: At least 12 characters (required)');
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();
  });

  it('rejects a short password and focuses the field with an announced error', async () => {
    const { user, fake } = setup();
    const spy = vi.spyOn(fake.api.auth, 'changePassword');
    await user.type(newPassword(), 'short');
    await user.type(confirmation(), 'short');
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 12 characters.');
    expect(newPassword()).toHaveFocus();
    expect(newPassword()).toHaveAccessibleDescription(/Use at least 12 characters/);
    expect(newPassword()).toBeInvalid();
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a mismatching confirmation and focuses it', async () => {
    const { user } = setup();
    await user.type(newPassword(), STRONG);
    await user.type(confirmation(), `${STRONG}x`);
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.');
    expect(confirmation()).toHaveFocus();
    expect(confirmation()).toHaveAccessibleDescription('The two passwords do not match.');
  });

  it('changes the password, clears the fields and refreshes the session', async () => {
    const changePassword = vi.fn(() => Promise.resolve());
    const { user, fake } = setup({ changePassword });
    const getSession = vi.spyOn(fake.api.auth, 'getSession');
    await user.type(newPassword(), STRONG);
    await user.type(confirmation(), STRONG);
    await user.click(submit());
    expect(await screen.findByText('Your password was changed.')).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith(STRONG);
    expect(newPassword()).toHaveValue('');
    expect(confirmation()).toHaveValue('');
    expect(getSession).toHaveBeenCalled();
  });

  it('disables the button while saving', async () => {
    let release!: () => void;
    const changePassword = () => new Promise<void>((resolve) => (release = resolve));
    const { user } = setup({ changePassword });
    await user.type(newPassword(), STRONG);
    await user.type(confirmation(), STRONG);
    await user.click(submit());
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    release();
    expect(await screen.findByRole('button', { name: 'Change password' })).toBeEnabled();
  });

  it.each([
    ['validation', 'That password was not accepted'],
    ['unauthenticated', 'Your session has expired'],
    ['network', 'Cannot reach the server'],
  ] as const)('maps the %s error to friendly text', async (code, text) => {
    const { user } = setup({ changePassword: () => Promise.reject({ code, message: 'raw server text' }) });
    await user.type(newPassword(), STRONG);
    await user.type(confirmation(), STRONG);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).not.toHaveTextContent('raw server text');
    expect(submit()).toBeEnabled();
    expect(newPassword()).toHaveValue(STRONG);
  });

  it('clears the success note when submitting again', async () => {
    const { user } = setup({ changePassword: () => Promise.resolve() });
    await user.type(newPassword(), STRONG);
    await user.type(confirmation(), STRONG);
    await user.click(submit());
    await screen.findByText('Your password was changed.');
    await user.click(submit());
    expect(screen.queryByText('Your password was changed.')).not.toBeInTheDocument();
  });
});
