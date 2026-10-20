import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installDialogPolyfill } from '../__fixtures__/dialogPolyfill';
import { ADMIN, ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import { renderApp } from '../__fixtures__/renderApp';
import type { AuthApi } from '../api/dataApi';
import * as download from '../auth/download';

beforeAll(installDialogPolyfill);

const openDeleteDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Delete my account and all my data' }));
  return screen.getByRole('dialog', { name: 'Delete your account?' });
};

describe('AccountPage', () => {
  it('shows the email and role of the signed-in user', async () => {
    renderApp('/account', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Email').nextElementSibling).toHaveTextContent('alex@example.com');
    expect(screen.getByText('Role').nextElementSibling).toHaveTextContent('user');
  });

  it('shows the admin role', async () => {
    renderApp('/account', createFakeApi(ADMIN).api);
    expect(await screen.findByText('admin', { selector: 'dd' })).toBeInTheDocument();
  });

  it('has the change-password form in its own labelled section', async () => {
    renderApp('/account', createFakeApi(ALEX).api);
    const section = await screen.findByRole('region', { name: 'Change password' });
    expect(within(section).getByLabelText('New password')).toBeInTheDocument();
  });

  describe('export', () => {
    it('downloads the export as a dated JSON file', async () => {
      const user = userEvent.setup();
      const blob = new Blob(['{"profile":null}'], { type: 'application/json' });
      const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => undefined);
      renderApp('/account', createFakeApi(ALEX, { exportMyData: () => Promise.resolve(blob) }).api);
      await user.click(await screen.findByRole('button', { name: 'Export my data' }));
      expect(await screen.findByText('Your export was downloaded.')).toBeInTheDocument();
      expect(save).toHaveBeenCalledWith(blob, expect.stringMatching(/^job-hunter-export-\d{4}-\d{2}-\d{2}\.json$/));
      save.mockRestore();
    });

    it('disables the button while preparing', async () => {
      const user = userEvent.setup();
      const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => undefined);
      let release!: (blob: Blob) => void;
      renderApp('/account', createFakeApi(ALEX, { exportMyData: () => new Promise<Blob>((r) => (release = r)) }).api);
      await user.click(await screen.findByRole('button', { name: 'Export my data' }));
      expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled();
      release(new Blob(['{}']));
      expect(await screen.findByRole('button', { name: 'Export my data' })).toBeEnabled();
      save.mockRestore();
    });

    it('reports a failed export', async () => {
      const user = userEvent.setup();
      renderApp('/account', createFakeApi(ALEX, { exportMyData: () => Promise.reject({ code: 'network', message: 'x' }) }).api);
      await user.click(await screen.findByRole('button', { name: 'Export my data' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    });
  });

  describe('delete account', () => {
    const deleteApi = (overrides: Partial<AuthApi> = {}) => {
      const deleteMyAccount = vi.fn<AuthApi['deleteMyAccount']>(() => Promise.resolve());
      const fake = createFakeApi(ALEX, { deleteMyAccount, ...overrides });
      return { deleteMyAccount, fake };
    };

    it('only opens a confirmation dialog first', async () => {
      const user = userEvent.setup();
      const { deleteMyAccount, fake } = deleteApi();
      renderApp('/account', fake.api);
      const dialog = await openDeleteDialog(user);
      expect(within(dialog).getByLabelText(/Type\s+DELETE\s+to confirm/)).toHaveFocus();
      expect(within(dialog).getByRole('button', { name: 'Delete everything' })).toBeDisabled();
      expect(deleteMyAccount).not.toHaveBeenCalled();
    });

    it('can be cancelled and reopened', async () => {
      const user = userEvent.setup();
      const { deleteMyAccount, fake } = deleteApi();
      renderApp('/account', fake.api);
      await openDeleteDialog(user);
      await user.type(screen.getByRole('textbox'), 'DELETE');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await openDeleteDialog(user);
      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(deleteMyAccount).not.toHaveBeenCalled();
    });

    it('deletes after the typed confirmation, then signs out to the login page', async () => {
      const user = userEvent.setup();
      const signOut = vi.fn<AuthApi['signOut']>(() => Promise.resolve());
      const { deleteMyAccount, fake } = deleteApi({ signOut });
      renderApp('/account', fake.api);
      await openDeleteDialog(user);
      await user.type(screen.getByRole('textbox'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await screen.findByLabelText('Email')).toBeInTheDocument();
      expect(deleteMyAccount).toHaveBeenCalledOnce();
      expect(signOut).toHaveBeenCalledOnce();
    });

    it('falls back to re-reading the session when the sign-out call fails', async () => {
      const user = userEvent.setup();
      let gone = false;
      const { fake } = deleteApi({
        deleteMyAccount: () => {
          gone = true;
          return Promise.resolve();
        },
        signOut: () => Promise.reject({ code: 'unauthenticated', message: 'no session' }),
        getSession: () => Promise.resolve(gone ? null : ALEX),
      });
      renderApp('/account', fake.api);
      await openDeleteDialog(user);
      await user.type(screen.getByRole('textbox'), 'DELETE');
      await user.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    });

    it('shows the last-admin guard as a friendly error and keeps the dialog open', async () => {
      const user = userEvent.setup();
      const { fake } = deleteApi({ deleteMyAccount: () => Promise.reject({ code: 'forbidden', message: 'last admin' }) });
      renderApp('/account', fake.api);
      const dialog = await openDeleteDialog(user);
      await user.type(screen.getByRole('textbox'), 'DELETE');
      await user.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('last admin');
      expect(within(dialog).getByRole('button', { name: 'Delete everything' })).toBeEnabled();
    });

    it('shows other failures with the default wording and can be dismissed with Escape', async () => {
      const user = userEvent.setup();
      const { fake } = deleteApi({ deleteMyAccount: () => Promise.reject({ code: 'network', message: 'x' }) });
      renderApp('/account', fake.api);
      const dialog = await openDeleteDialog(user);
      await user.type(screen.getByRole('textbox'), 'DELETE');
      await user.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cannot reach the server');
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await openDeleteDialog(user);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
