import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_USER, ALEX_USER, SAM_USER, createFakeAdmin } from '../__fixtures__/adminFake';
import type { FakeAdminApi } from '../__fixtures__/adminFake';
import { installDialogPolyfill } from '../__fixtures__/dialogPolyfill';
import { ADMIN, ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import { renderApp, withAdmin } from '../__fixtures__/renderApp';

beforeAll(installDialogPolyfill);

function setup(users = [ADMIN_USER, ALEX_USER, SAM_USER], adminOverrides: Partial<FakeAdminApi> = {}) {
  const fake = createFakeAdmin(users);
  const api = withAdmin(createFakeApi(ADMIN).api, { ...fake.admin, ...adminOverrides });
  renderApp('/admin', api);
  return { user: userEvent.setup(), fake };
}

const rowOf = async (email: string) => within(await screen.findByRole('row', { name: new RegExp(email) }));

describe('AdminPage access', () => {
  it('shows the forbidden screen, not the page, to a regular user', async () => {
    renderApp('/admin', withAdmin(createFakeApi(ALEX).api, createFakeAdmin([]).admin));
    expect(await screen.findByRole('heading', { level: 1, name: 'Not allowed' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin');
  });

  it('sends anonymous visitors to login', async () => {
    renderApp('/admin', createFakeApi(null).api);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('forces the password change before an admin can open it', async () => {
    renderApp('/admin', createFakeApi({ ...ADMIN, mustChangePassword: true }).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
  });
});

describe('AdminPage', () => {
  it('states the privacy rule', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByText(/cannot see other users/)).toHaveTextContent('jobs, CVs, letters, applications');
  });

  it('lists the accounts with their metadata', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Accounts (3)' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Email',
      'Role',
      'Created',
      'Last sign-in',
      'Status',
      'Actions',
    ]);
    const alex = await rowOf('alex@example.com');
    expect(alex.getByText('2026-02-10')).toBeInTheDocument();
    expect(alex.getByText('Never')).toBeInTheDocument();
    expect(alex.getByText('Active')).toBeInTheDocument();
    const sam = await rowOf('sam@example.com');
    expect(sam.getByText('2026-09-30 18:45')).toBeInTheDocument();
    expect(sam.getByText('Banned')).toBeInTheDocument();
  });

  it('shows a loading status while the list is fetched', async () => {
    const fake = createFakeAdmin([ADMIN_USER]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const listUsers = () => gate.then(() => fake.admin.listUsers());
    renderApp('/admin', withAdmin(createFakeApi(ADMIN).api, { ...fake.admin, listUsers }));
    expect((await screen.findByText('Loading users…')).tagName).toBe('OUTPUT');
    release();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Loading users…')).not.toBeInTheDocument();
  });

  it('gives the own account no actions', async () => {
    setup();
    const me = await rowOf('admin@example.com');
    expect(me.getByText('(you)')).toBeInTheDocument();
    expect(me.queryByRole('button')).not.toBeInTheDocument();
    expect(me.getByText('Your own account cannot be changed here')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const user = userEvent.setup();
    const fake = createFakeAdmin([ADMIN_USER]);
    let failing = true;
    const listUsers = () => (failing ? Promise.reject({ code: 'network', message: 'x' }) : fake.admin.listUsers());
    renderApp('/admin', withAdmin(createFakeApi(ADMIN).api, { ...fake.admin, listUsers }));
    expect(await screen.findByText('Cannot reach the server. Check your connection and try again.')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('row actions', () => {
    it('promotes and demotes, refetching the list', async () => {
      const { user, fake } = setup();
      await user.click(within(await screen.findByRole('row', { name: /alex@example.com/ })).getByRole('button', { name: 'Promote alex@example.com' }));
      expect(await screen.findByText('alex@example.com is now an admin.')).toBeInTheDocument();
      expect(fake.users().find((u) => u.id === 'user-alex')?.role).toBe('admin');
      const alex = await rowOf('alex@example.com');
      await user.click(await alex.findByRole('button', { name: 'Demote alex@example.com' }));
      expect(await screen.findByText('alex@example.com is now a regular user.')).toBeInTheDocument();
      expect(fake.users().find((u) => u.id === 'user-alex')?.role).toBe('user');
    });

    it('bans and unbans', async () => {
      const { user, fake } = setup();
      await user.click(within(await screen.findByRole('row', { name: /alex@example.com/ })).getByRole('button', { name: 'Ban alex@example.com' }));
      expect(await screen.findByText('alex@example.com was banned.')).toBeInTheDocument();
      expect(fake.users().find((u) => u.id === 'user-alex')?.banned).toBe(true);
      await user.click(within(await screen.findByRole('row', { name: /sam@example.com/ })).getByRole('button', { name: 'Unban sam@example.com' }));
      expect(await screen.findByText('sam@example.com was unbanned.')).toBeInTheDocument();
      expect(fake.users().find((u) => u.id === 'user-sam')?.banned).toBe(false);
    });

    it('disables the row buttons while an action runs', async () => {
      let release!: () => void;
      const base = createFakeAdmin([ADMIN_USER, ALEX_USER]);
      const setBanned = () => new Promise<never>((resolve) => (release = () => resolve(undefined as never)));
      const user = userEvent.setup();
      renderApp('/admin', withAdmin(createFakeApi(ADMIN).api, { ...base.admin, setBanned }));
      await user.click(within(await screen.findByRole('row', { name: /alex@example.com/ })).getByRole('button', { name: 'Ban alex@example.com' }));
      const alex = await rowOf('alex@example.com');
      expect(alex.getByRole('button', { name: 'Promote alex@example.com' })).toBeDisabled();
      expect(alex.getByRole('button', { name: 'Delete alex@example.com' })).toBeDisabled();
      release();
      expect(await screen.findByText('alex@example.com was banned.')).toBeInTheDocument();
      expect(alex.getByRole('button', { name: 'Promote alex@example.com' })).toBeEnabled();
    });

    it('demotes another admin', async () => {
      const second = { ...ADMIN_USER, id: 'user-admin-2', email: 'second-admin@example.com' };
      const { user } = setup([ADMIN_USER, second]);
      await user.click(
        within(await screen.findByRole('row', { name: /second-admin/ })).getByRole('button', {
          name: 'Demote second-admin@example.com',
        }),
      );
      expect(await screen.findByText('second-admin@example.com is now a regular user.')).toBeInTheDocument();
    });

    it('shows the backend guard error with friendly wording', async () => {
      const guard = () => Promise.reject({ code: 'forbidden', message: 'cannot remove the last admin' });
      const { user } = setup([ADMIN_USER, ALEX_USER], { setRole: guard });
      await user.click(within(await screen.findByRole('row', { name: /alex@example.com/ })).getByRole('button', { name: 'Promote alex@example.com' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('you cannot change your own account');
      expect(alert).toHaveTextContent('last remaining admin');
      expect(alert).not.toHaveTextContent('cannot remove the last admin');
      expect(await screen.findByRole('button', { name: 'Promote alex@example.com' })).toBeEnabled();
    });

    it('explains a user that disappeared in the meantime', async () => {
      const { user, fake } = setup([ADMIN_USER, ALEX_USER]);
      const button = await screen.findByRole('button', { name: 'Ban alex@example.com' });
      await fake.admin.deleteUser('user-alex');
      await user.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent('That user no longer exists');
      expect(screen.queryByRole('button', { name: 'Ban alex@example.com' })).not.toBeInTheDocument();
    });
  });

  describe('delete', () => {
    it('needs the typed email before deleting, then refetches', async () => {
      const { user, fake } = setup();
      await user.click(await screen.findByRole('button', { name: 'Delete alex@example.com' }));
      const dialog = screen.getByRole('dialog', { name: 'Delete this user?' });
      expect(within(dialog).getByRole('button', { name: 'Delete user' })).toBeDisabled();
      expect(within(dialog).getByLabelText(/Type\s+alex@example.com\s+to confirm/)).toHaveFocus();
      await user.type(within(dialog).getByRole('textbox'), 'alex@example.com');
      await user.click(within(dialog).getByRole('button', { name: 'Delete user' }));
      expect(await screen.findByText('alex@example.com and all their data were deleted.')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.users().map((u) => u.id)).toEqual(['user-admin', 'user-sam']);
      expect(screen.queryByRole('row', { name: /alex@example.com/ })).not.toBeInTheDocument();
    });

    it('can be cancelled without deleting', async () => {
      const { user, fake } = setup();
      await user.click(await screen.findByRole('button', { name: 'Delete alex@example.com' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.users()).toHaveLength(3);
    });

    it('shows a guard error inside the dialog and clears it when closed', async () => {
      const guard = () => Promise.reject({ code: 'forbidden', message: 'guard' });
      const { user } = setup([ADMIN_USER, ALEX_USER], { deleteUser: guard });
      await user.click(await screen.findByRole('button', { name: 'Delete alex@example.com' }));
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByRole('textbox'), 'alex@example.com');
      await user.click(within(dialog).getByRole('button', { name: 'Delete user' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('last remaining admin');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await user.click(screen.getByRole('button', { name: 'Delete alex@example.com' }));
      expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});

describe('CreateUserForm', () => {
  const emailField = () => screen.getByLabelText('Email', { selector: 'input[autocomplete="off"]' });
  const passwordField = () => screen.getByLabelText('Temporary password') as HTMLInputElement;
  const createWithPassword = () => screen.getByRole('button', { name: 'Create user with temporary password' });

  it('defaults to a temporary password: pre-filled, recommended, with the SMTP note on the invite option', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Create a user' });
    expect(screen.getByRole('radio', { name: 'Create with a temporary password (recommended)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Send invite email' })).not.toBeChecked();
    expect(screen.getByRole('group', { name: 'How does the person get access?' })).toHaveTextContent(
      'Requires custom SMTP to be configured; otherwise use a temporary password.',
    );
    expect(passwordField().value).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(passwordField()).toHaveAccessibleDescription(/You will see it once/);
    expect(createWithPassword()).toBeInTheDocument();
  });

  it('creates a user with the pre-filled password, shown once with a copy button', async () => {
    const { user, fake } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'ops@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'admin');
    const generated = passwordField().value;
    await user.click(createWithPassword());
    expect(await screen.findByText(/Account created for ops@example.com/)).toHaveTextContent('shown only once');
    expect(screen.getByText(generated, { selector: 'code' })).toBeInTheDocument();
    expect(fake.created).toEqual([{ email: 'ops@example.com', role: 'admin', tempPassword: generated }]);
    expect(emailField()).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('user');
    expect(passwordField().value).not.toBe(generated);
    expect(passwordField().value).toMatch(/^[A-Za-z0-9_-]{20}$/);

    await user.click(screen.getByRole('button', { name: 'Copy password' }));
    expect(await screen.findByText('Copied to the clipboard.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(generated);

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.queryByText(generated, { selector: 'code' })).not.toBeInTheDocument();
  });

  it('generates a new password on request and accepts an edited one', async () => {
    const { user, fake } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'ops@example.com');
    const first = passwordField().value;
    await user.click(screen.getByRole('button', { name: 'Generate new password' }));
    expect(passwordField().value).not.toBe(first);
    await user.clear(passwordField());
    const custom = 'my-own-temporary-pw';
    await user.type(passwordField(), custom);
    await user.click(createWithPassword());
    await screen.findByText(/Account created for ops@example.com/);
    expect(fake.created).toEqual([{ email: 'ops@example.com', role: 'user', tempPassword: custom }]);
  });

  it('sends an invite email when that option is chosen, without any password', async () => {
    const { user, fake } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), ' new.person@example.com ');
    await user.click(screen.getByRole('radio', { name: 'Send invite email' }));
    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send invite email' }));
    expect(await screen.findByText('Invite email sent to new.person@example.com.')).toBeInTheDocument();
    expect(fake.created).toEqual([{ email: 'new.person@example.com', role: 'user' }]);
    expect(screen.queryByRole('button', { name: 'Copy password' })).not.toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /new.person@example.com/ })).toBeInTheDocument();
    expect(emailField()).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Send invite email' })).toBeChecked();
  });

  it('can switch back to the temporary password', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('radio', { name: 'Send invite email' }));
    await user.click(screen.getByRole('radio', { name: 'Create with a temporary password (recommended)' }));
    expect(passwordField().value).toMatch(/^[A-Za-z0-9_-]{20}$/);
  });

  it('tells the admin when the clipboard is not available', async () => {
    const { user } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'ops@example.com');
    await user.click(createWithPassword());
    await screen.findByText(/Account created for/);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy');
  });

  it.each(['short', ''])('rejects the temporary password %j and focuses the field', async (value) => {
    const { user, fake } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'ops@example.com');
    await user.clear(passwordField());
    if (value !== '') await user.type(passwordField(), value);
    await user.click(createWithPassword());
    expect(await screen.findByText('A temporary password needs at least 12 characters.')).toBeInTheDocument();
    expect(passwordField()).toHaveFocus();
    expect(passwordField()).toBeInvalid();
    expect(passwordField()).toHaveAccessibleDescription(/at least 12 characters/);
    expect(fake.created).toEqual([]);
  });

  it.each([
    ['conflict', 'An account with that email address already exists.'],
    ['validation', 'Check the email address and the temporary password'],
    ['forbidden', 'Only admins can create accounts.'],
    ['network', 'Cannot reach the server'],
  ] as const)('maps the %s error to friendly text and keeps the input', async (code, text) => {
    const createUser = () => Promise.reject({ code, message: 'raw' });
    const { user } = setup([ADMIN_USER], { createUser });
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'ops@example.com');
    await user.click(createWithPassword());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).not.toHaveTextContent('raw');
    expect(emailField()).toHaveValue('ops@example.com');
    expect(createWithPassword()).toBeEnabled();
  });

  it('shows a conflict from the fake backend for an existing email', async () => {
    const { user } = setup();
    await user.type(await screen.findByLabelText('Email', { selector: 'input[autocomplete="off"]' }), 'alex@example.com');
    await user.click(createWithPassword());
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
